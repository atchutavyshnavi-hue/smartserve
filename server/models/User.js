const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const addressSchema = new mongoose.Schema({
  label: { type: String, default: 'Home' },
  line1: String,
  line2: String,
  city: String,
  state: String,
  pincode: String,
  zone: { type: String, enum: ['North', 'South', 'East', 'West', 'Central'], default: 'Central' },
  lat: Number,
  lng: Number,
  isDefault: { type: Boolean, default: false },
}, { _id: true });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 8, select: false },
  phone: { type: String, trim: true },
  role: {
    type: String,
    enum: ['customer', 'restaurant_owner', 'delivery_partner', 'admin'],
    default: 'customer',
  },
  addresses: [addressSchema],
  cuisinePreferences: [String],
  // Delivery partners only: the zone they operate/deliver in, so new
  // "food ready" notifications can be targeted rather than broadcast to
  // every rider on the platform regardless of area.
  zone: { type: String, enum: ['north', 'south', 'east', 'west', 'central'], default: null },
  isActive: { type: Boolean, default: true },
  passwordResetToken: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
}, { timestamps: true });

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
