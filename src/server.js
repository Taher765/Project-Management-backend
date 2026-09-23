import "dotenv/config";
import app from "./app.js";
import mongoose from "mongoose";

const PORT = process.env.PORT || 5000;

await mongoose.connect(process.env.MONGODB_URI);
console.log("MongoDB connected");

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
