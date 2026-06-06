const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = "trackflow_secret_key_change_in_production";

// ==============================
// VALIDATION HELPERS
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isValidPhone = (phone) => {
  const phoneRegex = /^\+?[0-9]{10,15}$/;
  return phoneRegex.test(phone);
};

// ==============================
// MONGODB CONNECTION
mongoose.connect(
  "mongodb://AdminAJ:Pakixtan.008@ac-lv7ymnq-shard-00-00.ukpscky.mongodb.net:27017,ac-lv7ymnq-shard-00-01.ukpscky.mongodb.net:27017,ac-lv7ymnq-shard-00-02.ukpscky.mongodb.net:27017/tripTracker?ssl=true&replicaSet=atlas-bji5vp-shard-0&authSource=admin"
)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("MongoDB error:", err));

// ==============================
// USER SCHEMA
const userSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  email:     { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  phone:     { type: String, unique: true, sparse: true, trim: true },
  password:  { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ==============================
// TRIP SCHEMA
const tripSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startTime:     { type: Date, required: true },
  endTime:       Date,
  distance:      { type: Number, default: 0 },
  duration:      { type: Number, default: 0 },
  avgSpeed:      { type: Number, default: 0 },
  startLat:      Number,
  startLng:      Number,
  endLat:        Number,
  endLng:        Number,
  route:         [{ lat: Number, lng: Number }],
  isValid:       { type: Boolean, default: true },
  invalidReason: { type: String, default: "" },
  createdAt:     { type: Date, default: Date.now }
});

const Trip = mongoose.model('Trip', tripSchema);

// ==============================
// AUTH MIDDLEWARE
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: "Invalid token format" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Session expired. Please login again." });
  }
};

// ==============================
// REGISTER
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Name check
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: "Please enter your full name" });
    }

    // Must have email OR phone
    if (!email && !phone) {
      return res.status(400).json({ success: false, message: "Please provide an email or phone number" });
    }

    // Validate email if provided
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address" });
    }

    // Validate phone if provided
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ success: false, message: "Please enter a valid phone number (10-15 digits)" });
    }

    // Password length
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    // Check if email already exists
    if (email) {
      const existingEmail = await User.findOne({ email: email.toLowerCase() });
      if (existingEmail) {
        return res.status(400).json({ success: false, message: "This email is already registered" });
      }
    }

    // Check if phone already exists
    if (phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return res.status(400).json({ success: false, message: "This phone number is already registered" });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name: name.trim(),
      email: email ? email.toLowerCase().trim() : undefined,
      phone: phone ? phone.trim() : undefined,
      password: hashedPassword
    });

    await user.save();

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, phone: user.phone }
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================
// LOGIN
app.post('/auth/login', async (req, res) => {
  try {
    const { emailOrPhone, password } = req.body;

    if (!emailOrPhone || !password) {
      return res.status(400).json({ success: false, message: "Please fill in all fields" });
    }

    // Find by email or phone
    const isEmail = isValidEmail(emailOrPhone);
    const user = isEmail
      ? await User.findOne({ email: emailOrPhone.toLowerCase().trim() })
      : await User.findOne({ phone: emailOrPhone.trim() });

    if (!user) {
      return res.status(401).json({ success: false, message: "No account found with this email or phone" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Incorrect password" });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, phone: user.phone }
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================
// GET CURRENT USER
app.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================
// TRIP ROUTES

app.post('/trips', authMiddleware, async (req, res) => {
  try {
    const trip = new Trip({ ...req.body, userId: req.userId, isValid: true, invalidReason: "" });
    await trip.save();
    res.status(201).json({ success: true, trip });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/trips', authMiddleware, async (req, res) => {
  try {
    const trips = await Trip.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json(trips);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/trips/:id', authMiddleware, async (req, res) => {
  try {
    const data = req.body;
    const isValidTrip = data.route && data.route.length > 1 && data.distance && data.distance > 0;
    const updatedTrip = await Trip.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { $set: { ...data, isValid: isValidTrip, invalidReason: isValidTrip ? "" : "No movement or invalid update" } },
      { new: true }
    );
    if (!updatedTrip) {
      return res.status(404).json({ success: false, message: "Trip not found" });
    }
    res.json({ success: true, trip: updatedTrip });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/trips/:id', authMiddleware, async (req, res) => {
  try {
    const trip = await Trip.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!trip) {
      return res.status(404).json({ success: false, message: "Trip not found" });
    }
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/trips/week', authMiddleware, async (req, res) => {
  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const trips = await Trip.find({ userId: req.userId, createdAt: { $gte: weekAgo } });
    let totalDistance = 0;
    let totalDuration = 0;
    trips.forEach(t => { totalDistance += t.distance; totalDuration += t.duration; });
    res.json({ totalTrips: trips.length, totalDistance, totalDuration });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(3000, "0.0.0.0", () => {
  console.log("Server running on port 3000");
});