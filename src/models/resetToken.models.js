import mongoose from "mongoose";
import bcrypt from "bcrypt";

const resetTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  token: { type: String, required: true },
  expiresAt: {
    type: Date,
    required: true,
    expires: 0,
    default: () => Date.now() + parseInt(process.env.RESET_TOKEN_EXPIRY_MS),
  },
});

export const ResetToken = new mongoose.model("ResetToken", resetTokenSchema);
