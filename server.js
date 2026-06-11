const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "trackflow_secret_key_change_in_production";
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const BREVO_SMTP_KEY = process.env.BREVO_SMTP_KEY;

// ==============================
// EMAIL TRANSPORTER
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: EMAIL_USER,
    pass: BREVO_SMTP_KEY,
  },
});
console.log("Email config:", EMAIL_USER ? "EMAIL_USER set" : "EMAIL_USER MISSING", BREVO_SMTP_KEY ? "BREVO_KEY set" : "BREVO_KEY MISSING");
// ==============================
// SEND OTP EMAIL
const sendOTPEmail = async (toEmail, otp, type) => {
  const subject = type === 'verify'
    ? 'TrackFlow — Verify Your Email'
    : 'TrackFlow — Reset Your Password';

  const message = type === 'verify'
    ? `Your verification code is: <b>${otp}</b><br>This code expires in 10 minutes.`
    : `Your password reset code is: <b>${otp}</b><br>This code expires in 10 minutes.`;

  // Verify transporter connection first
await transporter.sendMail({
   from: `"TrackFlow" <trackflowoficial@gmail.com>`,
    to: toEmail,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 400px; margin: auto;">
        <h2 style="color: #3B82F6;">TrackFlow</h2>
        <p>${message}</p>
        <p style="color: #999; font-size: 12px;">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
};

// ==============================
// GENERATE 6 DIGIT OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

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
// REGISTER — saves user, sends OTP
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: "Please enter your full name" });
    }
    if (!email && !phone) {
      return res.status(400).json({ success: false, message: "Please provide an email or phone number" });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address" });
    }
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ success: false, message: "Please enter a valid phone number (10-15 digits)" });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    if (email) {
      const existingEmail = await User.findOne({ email: email.toLowerCase() });
      if (existingEmail) {
        return res.status(400).json({ success: false, message: "This email is already registered" });
      }
    }
    if (phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return res.status(400).json({ success: false, message: "This phone number is already registered" });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Send email FIRST before saving — if email fails, nothing gets saved
    if (email) {
      try {
        await sendOTPEmail(email.toLowerCase().trim(), otp, 'verify');
      } catch (emailErr) {
        return res.status(500).json({
          success: false,
          message: "Failed to send verification email. Please check your email address and try again."
        });
      }
    }

    // Save user AFTER email sent successfully
    const user = new User({
      name: name.trim(),
      email: email ? email.toLowerCase().trim() : undefined,
      phone: phone ? phone.trim() : undefined,
      password: hashedPassword,
      isVerified: phone ? true : false, // phone users auto-verified, email users need OTP
      otp: email ? otp : undefined,
      otpExpiresAt: email ? otpExpiresAt : undefined,
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: email
        ? "Verification code sent to your email."
        : "Account created successfully.",
      userId: user._id.toString(),
      requiresVerification: email ? true : false,
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================
// VERIFY OTP
app.post('/auth/verify-otp', async (req, res) => {
  try {
    const { userId, otp } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, message: "Account already verified" });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ success: false, message: "Incorrect code. Please try again." });
    }

    if (new Date() > user.otpExpiresAt) {
      return res.status(400).json({ success: false, message: "Code expired. Please request a new one." });
    }

    // Mark verified
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiresAt = undefined;
    await user.save();
const token = jwt.sign(
      { userId: user._id.toString() },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email || "",
        phone: user.phone || ""
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================
// RESEND OTP
app.post('/auth/resend-otp', async (req, res) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, message: "Account already verified" });
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    if (user.email) {
      await sendOTPEmail(user.email, otp, 'verify');
    }

    res.json({ success: true, message: "New code sent to your email" });

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

    // Check if verified
    if (!user.isVerified) {
      // Resend OTP
      const otp = generateOTP();
      user.otp = otp;
      user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();

      if (user.email) {
        try {
          await sendOTPEmail(user.email, otp, 'verify');
        } catch (e) {}
      }

      return res.status(403).json({
        success: false,
        requiresVerification: true,
        userId: user._id,
        message: "Please verify your email first. A new code has been sent."
      });
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
// FORGOT PASSWORD — send OTP
// ==============================
// FORGOT PASSWORD — supports email OR phone
app.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: "Please provide your email or phone number"
      });
    }

    // Find user by email or phone
    const user = email
      ? await User.findOne({ email: email.toLowerCase().trim() })
      : await User.findOne({ phone: phone.trim() });

    // Don't reveal if account exists or not
    if (!user) {
      return res.json({
        success: true,
        message: "If this account exists, a reset code has been sent."
      });
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    // Send email OTP if user has email
    if (user.email) {
      try {
        await sendOTPEmail(user.email, otp, 'reset');
      } catch (emailErr) {
        console.log("Email send failed:", emailErr.message);
      }
    }

    res.json({
      success: true,
      message: "Reset code sent.",
      userId: user._id
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================
// RESET PASSWORD
app.post('/auth/reset-password', async (req, res) => {
  try {
    const { userId, otp, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ success: false, message: "Incorrect code. Please try again." });
    }

    if (new Date() > user.otpExpiresAt) {
      return res.status(400).json({ success: false, message: "Code expired. Please request a new one." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.otp = undefined;
    user.otpExpiresAt = undefined;
    await user.save();

    res.json({ success: true, message: "Password reset successfully. Please login." });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================
// GET CURRENT USER
app.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password -otp -otpExpiresAt');
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================
// UPDATE PROFILE
app.put('/auth/profile', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: "Please enter a valid name" });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: { name: name.trim() } },
      { new: true }
    ).select('-password -otp -otpExpiresAt');

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================
// CHANGE PASSWORD (logged in)
app.put('/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Please fill in all fields" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "New password must be at least 6 characters" });
    }

    const user = await User.findById(req.userId);
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Current password is incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ success: true, message: "Password changed successfully" });
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