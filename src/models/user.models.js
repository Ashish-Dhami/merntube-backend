import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      lowercase: true,
      unique: true,
      index: true,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    avatar: {
      type: String,
      required: true,
    },
    refreshToken: {
      type: String,
    },
    watchHistory: [
      {
        videoId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Video", // Still references the Video model
          required: true, // Optional: enforce that videoId is always provided
        },
        viewedOn: {
          type: Date, // Store as a Date object (recommended over string)
          default: Date.now, // Optional: default to current time if not provided
        },
        timezoneOffset: {
          type: Number,
          default: () => new Date().getTimezoneOffset() * 60000,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("refreshToken") || !this.refreshToken) return next();
  this.refreshToken = await bcrypt.hash(this.refreshToken, 10);
  next();
});

userSchema.methods.verifyPassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = async function () {
  return await jwt.sign({ id: this._id }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
  });
};

userSchema.methods.generateRefreshToken = async function (rememberMe) {
  return await jwt.sign(
    { id: this._id, rememberMe: !!rememberMe },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: rememberMe ? "30d" : process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

export const User = mongoose.model("User", userSchema);
