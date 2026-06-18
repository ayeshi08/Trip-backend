const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "trackflow_secret_key_change_in_production";
const EMAIL_USER = process.env.EMAIL_USER;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

// ==============================
// RATE LIMITERS
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { success: false, message: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // max 10 auth attempts per 15 min per IP
  message: { success: false, message: "Too many attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // max 5 OTP requests per hour
  message: { success: false, message: "Too many OTP requests. Please try again in 1 hour." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);

// ==============================
// SEND OTP EMAIL VIA BREVO API
//const sendOTPEmail = async (toEmail, otp, type) => {
//  const subject = type === 'verify'
   // ? 'TrackFlow — Verify Your Email'
   // : 'TrackFlow — Reset Your Password';

//  const message = type === 'verify'
 //   ? `Your verification code is: <b>${otp}</b><br>This code expires in 10 minutes.`
   // : `Your password reset code is: <b>${otp}</b><br>This code expires in 10 minutes.`;

//  await axios.post(
  //  'https://api.brevo.com/v3/smtp/email',
    //{
      //sender: { name: 'TrackFlow', email: EMAIL_USER },
      //to: [{ email: toEmail }],
      //subject,
      //htmlContent: `
        //<div style="font-family: Arial, sans-serif; max-width: 400px; margin: auto; padding: 24px; background: #f9f9f9; border-radius: 12px;">
          //<h2 style="color: #3B82F6; margin-bottom: 8px;">TrackFlow</h2>
          //<p style="font-size: 16px; color: #333;">${message}</p>
          //<p style="color: #999; font-size: 12px; margin-top: 24px;">If you didn't request this, you can safely ignore this email.</p>
        //</div>
      //`,
    //},
    //{ headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' } }
  //);
//};
const sendOTPEmail = async (toEmail, otp, type) => {
  console.log("========== EMAIL DEBUG ==========");
  console.log("TO:", toEmail);
  console.log("TYPE:", type);
  console.log("EMAIL_USER:", EMAIL_USER);
  console.log("BREVO KEY EXISTS:", !!BREVO_API_KEY);

  const subject = type === 'verify'
    ? 'TrackFlow — Verify Your Email'
    : 'TrackFlow — Reset Your Password';

  const message = type === 'verify'
    ? `Your verification code is: <b>${otp}</b><br>This code expires in 10 minutes.`
    : `Your password reset code is: <b>${otp}</b><br>This code expires in 10 minutes.`;

  try {
    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: { name: 'TrackFlow', email: EMAIL_USER },
        to: [{ email: toEmail }],
        subject,
        htmlContent: `<p>${message}</p>`,
      },
      {
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log("BREVO STATUS:", response.status);
    console.log("BREVO RESPONSE:", response.data);
    console.log("========== EMAIL SENT ==========");

    return response.data;
  } catch (err) {
    console.log("========== BREVO ERROR ==========");

    if (err.response) {
      console.log("STATUS:", err.response.status);
      console.log("DATA:", err.response.data);
    } else {
      console.log(err.message);
    }

    throw err;
  }
};

// ==============================
// GENERATE 6 DIGIT OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ==============================
// VALIDATION HELPERS
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPhone = (phone) => /^\+?[0-9]{10,15}$/.test(phone);

// ==============================
// MONGODB CONNECTION
mongoose.connect(
  "mongodb://AdminAJ:Pakixtan.008@ac-lv7ymnq-shard-00-00.ukpscky.mongodb.net:27017,ac-lv7ymnq-shard-00-01.ukpscky.mongodb.net:27017,ac-lv7ymnq-shard-00-02.ukpscky.mongodb.net:27017/tripTracker?ssl=true&replicaSet=atlas-bji5vp-shard-0&authSource=admin"
).then(() => console.log("MongoDB connected"))
 .catch(err => console.log("MongoDB connection error:", err.message));

// ==============================
// USER SCHEMA
const userSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  email:        { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  phone:        { type: String, unique: true, sparse: true, trim: true },
  password:     { type: String, required: true },
  isVerified:   { type: Boolean, default: false },
  otp:          { type: String },
  otpExpiresAt: { type: Date },
  createdAt:    { type: Date, default: Date.now }
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
  if (!authHeader) return res.status(401).json({ success: false, message: "No token provided" });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: "Invalid token format" });
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
app.post('/auth/register', authLimiter, async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || name.trim().length < 2)
      return res.status(400).json({ success: false, message: "Please enter your full name" });
    if (!email && !phone)
      return res.status(400).json({ success: false, message: "Please provide an email or phone number" });
    if (email && !isValidEmail(email))
      return res.status(400).json({ success: false, message: "Please enter a valid email address" });
    if (phone && !isValidPhone(phone))
      return res.status(400).json({ success: false, message: "Please enter a valid phone number (10-15 digits)" });
    if (!password || password.length < 6)
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });

    if (email) {
      const existingEmail = await User.findOne({ email: email.toLowerCase() });
      if (existingEmail) return res.status(400).json({ success: false, message: "This email is already registered" });
    }
    if (phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) return res.status(400).json({ success: false, message: "This phone number is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Send email FIRST — if it fails, don't save user
    if (email) {
      try {
        await sendOTPEmail(email.toLowerCase().trim(), otp, 'verify');
      } catch (emailErr) {
        return res.status(500).json({ success: false, message: "Failed to send verification email. Please check your email and try again." });
      }
    }

    const user = new User({
      name: name.trim(),
      email: email ? email.toLowerCase().trim() : undefined,
      phone: phone ? phone.trim() : undefined,
      password: hashedPassword,
      isVerified: phone ? true : false,
      otp: email ? otp : undefined,
      otpExpiresAt: email ? otpExpiresAt : undefined,
    });
    await user.save();

    res.status(201).json({
      success: true,
      message: email ? "Verification code sent to your email." : "Account created successfully.",
      userId: user._id.toString(),
      requiresVerification: email ? true : false,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
});

// ==============================
// VERIFY OTP
app.post('/auth/verify-otp', authLimiter, async (req, res) => {
  try {
    const { userId, otp } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.isVerified) return res.status(400).json({ success: false, message: "Account already verified" });
    if (user.otp !== otp) return res.status(400).json({ success: false, message: "Incorrect code. Please try again." });
    if (new Date() > user.otpExpiresAt) return res.status(400).json({ success: false, message: "Code expired. Please request a new one." });

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiresAt = undefined;
    await user.save();

    const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      success: true, token,
      user: { id: user._id.toString(), name: user.name, email: user.email || "", phone: user.phone || "" }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
});

// ==============================
// RESEND OTP
app.post('/auth/resend-otp', otpLimiter, async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.isVerified) return res.status(400).json({ success: false, message: "Account already verified" });

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    if (user.email) await sendOTPEmail(user.email, otp, 'verify');
    res.json({ success: true, message: "New code sent to your email" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
});

// ==============================
// LOGIN
app.post('/auth/login', authLimiter, async (req, res) => {
  try {
    const { emailOrPhone, password } = req.body;
    if (!emailOrPhone || !password)
      return res.status(400).json({ success: false, message: "Please fill in all fields" });

    const isEmail = isValidEmail(emailOrPhone);
    const user = isEmail
      ? await User.findOne({ email: emailOrPhone.toLowerCase().trim() })
      : await User.findOne({ phone: emailOrPhone.trim() });

    if (!user) return res.status(401).json({ success: false, message: "No account found with this email or phone" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Incorrect password" });

    if (!user.isVerified) {
      const otp = generateOTP();
      user.otp = otp;
      user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();
      if (user.email) {
        try { await sendOTPEmail(user.email, otp, 'verify'); } catch (e) {}
      }
      return res.status(403).json({
        success: false, requiresVerification: true,
        userId: user._id.toString(),
        message: "Please verify your email. A new code has been sent."
      });
    }

    const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      success: true, token,
      user: { id: user._id.toString(), name: user.name, email: user.email || "", phone: user.phone || "" }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
});

// ==============================
// FORGOT PASSWORD
app.post('/auth/forgot-password', otpLimiter, async (req, res) => {
  try {
    const { email, phone } = req.body;
    if (!email && !phone)
      return res.status(400).json({ success: false, message: "Please provide your email or phone number" });

    const user = email
      ? await User.findOne({ email: email.toLowerCase().trim() })
      : await User.findOne({ phone: phone.trim() });

    if (!user) return res.json({ success: true, message: "If this account exists, a reset code has been sent." });

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    if (user.email) {
      try { await sendOTPEmail(user.email, otp, 'reset'); } catch (e) {}
    }

    res.json({ success: true, message: "Reset code sent.", userId: user._id.toString() });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
});

// ==============================
// RESET PASSWORD
app.post('/auth/reset-password', authLimiter, async (req, res) => {
  try {
    const { userId, otp, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.otp !== otp) return res.status(400).json({ success: false, message: "Incorrect code. Please try again." });
    if (new Date() > user.otpExpiresAt) return res.status(400).json({ success: false, message: "Code expired. Please request a new one." });

    user.password = await bcrypt.hash(newPassword, 10);
    user.otp = undefined;
    user.otpExpiresAt = undefined;
    await user.save();

    res.json({ success: true, message: "Password reset successfully. Please login." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
});

// ==============================
// GET CURRENT USER
app.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password -otp -otpExpiresAt');
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
});

// ==============================
// UPDATE PROFILE NAME
app.put('/auth/profile', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim().length < 2)
      return res.status(400).json({ success: false, message: "Please enter a valid name" });

    const user = await User.findByIdAndUpdate(
      req.userId, { $set: { name: name.trim() } }, { new: true }
    ).select('-password -otp -otpExpiresAt');

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
});

// ==============================
// CHANGE PASSWORD
app.put('/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, message: "Please fill in all fields" });
    if (newPassword.length < 6)
      return res.status(400).json({ success: false, message: "New password must be at least 6 characters" });

    const user = await User.findById(req.userId);
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: "Current password is incorrect" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error. Please try again." });
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
    res.status(500).json({ success: false, message: "Server error." });
  }
});

app.get('/trips', authMiddleware, async (req, res) => {
  try {
    const trips = await Trip.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json(trips);
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
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
    if (!updatedTrip) return res.status(404).json({ success: false, message: "Trip not found" });
    res.json({ success: true, trip: updatedTrip });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

app.delete('/trips/:id', authMiddleware, async (req, res) => {
  try {
    const trip = await Trip.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!trip) return res.status(404).json({ success: false, message: "Trip not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

app.get('/trips/week', authMiddleware, async (req, res) => {
  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const trips = await Trip.find({ userId: req.userId, createdAt: { $gte: weekAgo } });
    let totalDistance = 0, totalDuration = 0;
    trips.forEach(t => { totalDistance += t.distance; totalDuration += t.duration; });
    res.json({ totalTrips: trips.length, totalDistance, totalDuration });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error." });
  }
});

app.listen(3000, "0.0.0.0", () => console.log("Server running on port 3000"));