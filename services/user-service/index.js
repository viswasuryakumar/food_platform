require("dotenv").config();           // Load .env values
const express = require("express");    // Import express
const mongoose = require("mongoose");  // Import mongoose
const cors = require("cors");          // Allow frontend requests
const bcrypt = require("bcryptjs");    // To hash passwords
const jwt = require("jsonwebtoken");   // To create JWT tokens

const User = require("./models/User"); // Our User model

const app = express();
app.use(cors());
app.use(express.json());
mongoose.set("bufferCommands", false);


// ---------- REGISTER ROUTE ----------
app.post("/auth/register", async (req, res) => {
  const { name, email, password } = req.body;

  // 1. Check if email already exists
  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ message: "Email already exists" });

  // 2. Hash the password
  const hashed = await bcrypt.hash(password, 10);

  // 3. Save user
  const user = new User({ name, email, password: hashed });
  await user.save();

  res.json({ message: "User registered" });
});


// ---------- LOGIN ROUTE ----------
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  // 1. Check email
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: "User not found" });

  // 2. Compare password
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ message: "Wrong password" });

  // 3. Create JWT token
  const token = jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
);


  res.json({ token });
});

// Test route
app.get("/", (req, res) => {
  res.send("User Service Running");
});

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 3000,
    });
    console.log("User DB Connected");

    app.listen(process.env.PORT, () =>
      console.log(`User Service running on ${process.env.PORT}`)
    );
  } catch (err) {
    console.error("Fatal DB Error:", err.message);
    process.exit(1);
  }
}

startServer();
    
