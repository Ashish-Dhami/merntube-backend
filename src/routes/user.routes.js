import { Router } from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  forgetMe,
  changePassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  getUserChannelProfile,
  getWatchHistory,
  getSavedUser,
  forgotPassword,
  verifyResetToken,
  resetPassword,
} from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { isLoggedIn } from "../middlewares/auth.middleware.js";

const router = Router();
router
  .route("/register")
  .post(upload.fields([{ name: "avatar" }]), registerUser);
router.route("/login").post(loginUser);
router.route("/logout").post(isLoggedIn, logoutUser);
router.route("/refreshAccessToken").post(refreshAccessToken);
router.route("/forget-me").post(forgetMe);
router.route("/changePassword").post(isLoggedIn, changePassword);
router.route("/currentUser").get(isLoggedIn, getCurrentUser);
router.route("/updateDetails").patch(isLoggedIn, updateAccountDetails);
router
  .route("/updateAvatar")
  .patch(isLoggedIn, upload.single("avatar"), updateUserAvatar);
router.route("/userProfile/:username").get(isLoggedIn, getUserChannelProfile);
router.route("/watchHistory").get(isLoggedIn, getWatchHistory);
router.route("/get-saved-user").get(getSavedUser);
router.route("/forgot-password").post(forgotPassword);
router.route("/verify-reset-token/:token").get(verifyResetToken);
router.route("/reset-password/:token").post(resetPassword);

export default router;
