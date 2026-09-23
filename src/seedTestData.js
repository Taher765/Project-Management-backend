import "dotenv/config";
import mongoose from "mongoose";
import Project from "./models/Project.js";
import Worker from "./models/Worker.js";
import WorkerProject from "./models/WorkerProject.js";
import Week from "./models/Week.js";
import Transaction from "./models/Transaction.js";
import ProjectExpense from "./models/ProjectExpense.js";
import ProjectReceipt from "./models/ProjectReceipt.js";
import { days, range, today } from "./utils/date.js";

function shift(v,n){const d=new Date(`${v}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
const now=today();
await mongoose.connect(process.env.MONGODB_URI);
const projectA=await Project.findOneAndUpdate({code:"TEST-A"},{name:"TEST مشروع A",code:"TEST-A",description:"مشروع اختبار مستقل",status:"active",startedAt:shift(now,-100)},{upsert:true,new:true,setDefaultsOnInsert:true});
const projectB=await Project.findOneAndUpdate({code:"TEST-B"},{name:"TEST مشروع B",code:"TEST-B",description:"مشروع اختبار مستقل ثاني",status:"active",startedAt:shift(now,-60)},{upsert:true,new:true,setDefaultsOnInsert:true});
const specs=["TEST أحمد","TEST محمد","TEST علي","TEST محمود"],wages=[150,180,200,220];

// Workers are project-local: the same name in A and B is a different Worker document.
const projectWorkers = new Map();
for (const project of [projectA, projectB]) {
  const list = [];
  for (let i=0;i<specs.length;i++) {
    if (project === projectB && i > 1) continue;
    const amount = project === projectB && i === 0 ? 190 : wages[i];
    let w = await Worker.findOne({ projectId: project._id, name: specs[i] });
    if (!w) w = await Worker.create({ projectId: project._id, name: specs[i], currentWage: amount, wageHistory: [{ amount, effectiveFrom: project === projectA ? shift(now,-100) : shift(now,-60) }], hidden:false });
    list.push(w);
  }
  projectWorkers.set(project._id.toString(), list);
}

await WorkerProject.deleteMany({projectId:{$in:[projectA._id,projectB._id]}});
const aWorkers=projectWorkers.get(projectA._id.toString()), bWorkers=projectWorkers.get(projectB._id.toString());
await WorkerProject.create([
 {projectId:projectA._id,workerId:aWorkers[0]._id,currentWage:200,wageHistory:[{amount:150,effectiveFrom:shift(now,-100)},{amount:170,effectiveFrom:shift(now,-80)},{amount:200,effectiveFrom:shift(now,-30)}],effectiveFrom:shift(now,-100),effectiveTo:null},
 {projectId:projectB._id,workerId:bWorkers[0]._id,currentWage:190,wageHistory:[{amount:190,effectiveFrom:shift(now,-60)}],effectiveFrom:shift(now,-60),effectiveTo:null}
]);
for(let i=1;i<aWorkers.length;i++) await WorkerProject.create({projectId:projectA._id,workerId:aWorkers[i]._id,currentWage:wages[i],wageHistory:[{amount:wages[i],effectiveFrom:shift(now,-100)}],effectiveFrom:shift(now,-100),effectiveTo:null});
if (bWorkers[1]) await WorkerProject.create({projectId:projectB._id,workerId:bWorkers[1]._id,currentWage:210,wageHistory:[{amount:210,effectiveFrom:shift(now,-60)}],effectiveFrom:shift(now,-60),effectiveTo:null});

for(const project of [projectA,projectB]){
 const start=range(shift(now,-98)).weekStart;
 for(let n=0;n<16;n++){
  const r=range(shift(start,n*7));
  let week=await Week.findOneAndUpdate({projectId:project._id,weekStart:r.weekStart},{projectId:project._id,...r,closed:false},{upsert:true,new:true,setDefaultsOnInsert:true});
  const assignments=await WorkerProject.find({projectId:project._id}).lean();
  for(const a of assignments){if(a.effectiveFrom>r.weekEnd || (a.effectiveTo&&a.effectiveTo<r.weekStart))continue;let e=week.workers.find(x=>x.workerId.toString()===a.workerId.toString());if(!e){e={workerId:a.workerId,deleted:false,deletedAt:null,days:[]};week.workers.push(e);}for(const d of days(r.weekStart)){if(e.days.some(x=>x.date===d))continue;const active=a.effectiveFrom<=d&&(!a.effectiveTo||a.effectiveTo>=d);const hist=[...(a.wageHistory||[])].filter(x=>x.effectiveFrom<=d).sort((x,y)=>x.effectiveFrom.localeCompare(y.effectiveFrom));const wage=active&&hist.length?Number(hist.at(-1).amount):0;const attended=d<=now&&wage>0&&((new Date(`${d}T00:00:00Z`).getUTCDate()+a.workerId.toString().charCodeAt(0))%4!==0);e.days.push({date:d,attended,wage,deductionAmount:attended&&wage>0?10:0});}}
  await week.save();
 }
}
const aDate=shift(now,-20),bDate=shift(now,-10);
await Transaction.deleteMany({projectId:{$in:[projectA._id,projectB._id]},note:"بيانات اختبار"});
await Transaction.create([
 {projectId:projectA._id,workerId:aWorkers[0]._id,type:"reward",amount:100,note:"بيانات اختبار",date:aDate},
 {projectId:projectA._id,workerId:aWorkers[0]._id,type:"payment",amount:400,note:"بيانات اختبار",date:aDate},
 {projectId:projectB._id,workerId:bWorkers[0]._id,type:"payment",amount:250,note:"بيانات اختبار",date:bDate},
 {projectId:projectA._id,workerId:aWorkers[1]._id,type:"deduction",amount:50,note:"بيانات اختبار",date:aDate}
]);
await ProjectExpense.deleteMany({projectId:{$in:[projectA._id,projectB._id]},note:"بيانات اختبار"});
await ProjectReceipt.deleteMany({projectId:{$in:[projectA._id,projectB._id]},note:"بيانات اختبار"});
await ProjectExpense.create([{projectId:projectA._id,amount:1200,category:"food",date:aDate,note:"بيانات اختبار"},{projectId:projectA._id,amount:500,category:"transport",date:bDate,note:"بيانات اختبار"},{projectId:projectB._id,amount:800,category:"materials",date:bDate,note:"بيانات اختبار"}]);
await ProjectReceipt.create([{projectId:projectA._id,amount:8000,date:shift(now,-25),note:"بيانات اختبار"},{projectId:projectA._id,amount:3000,date:shift(now,-5),note:"بيانات اختبار"},{projectId:projectB._id,amount:5000,date:bDate,note:"بيانات اختبار"}]);
console.log("Multi-project test data ready: projects A/B, Ahmed assigned A -> B -> A, isolated wages, weeks, transactions, expenses and receipts.");
await mongoose.disconnect();
