import { User } from "../models/user.models.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { deleteFromUrl, upload } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const generateAccessAndRefreshTokens = async (userId, rememberMe) => {
  if (!userId) return { accessToken: null, refreshToken: null };
  const user = await User.findById(userId);
  const accessToken = await user.generateAccessToken();
  const refreshToken = await user.generateRefreshToken(rememberMe);
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });
  return { accessToken, refreshToken };
};

const registerUser = asyncHandler(async (req, res) => {
  //take react hook form data from req.body
  const { username, fullName, email, password } = req.body;
  //validate if fields are not empty
  if (
    [username, fullName, email, password].some((field) => {
      return field === undefined || field === null || field?.trim() === "";
    })
  ) {
    throw new ApiError(400, "all fields are required");
  }
  //check if user already exists
  const userCheck = await User.findOne({ $or: [{ username }, { email }] });
  if (userCheck) {
    throw new ApiError(401, "user already exists");
  }
  //upload req.files cloudinary
  const avatarLocalPath = req.files?.avatar[0]?.path;
  if (!avatarLocalPath)
    throw new ApiError(500, "couldn't find avatar path on disk");
  const uploadedAvatar = await upload(avatarLocalPath);
  if (!uploadedAvatar)
    throw new ApiError(400, "couldn't save avatar file to cloudinary");
  //if not exists, create a user
  const user = await User.create({
    username,
    fullName,
    email,
    password,
    avatar: uploadedAvatar?.url,
  });

  const newUser = await User.findById(user?._id).select("-password");

  if (!newUser) {
    throw new ApiError(501, "error occurred while registering");
  }
  return res
    .status(201)
    .json(new ApiResponse(200, "user registered successfully", newUser));
});

const loginUser = asyncHandler(async (req, res) => {
  const { username, email, password, rememberMe } = req.body;
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });
  if (!user) throw new ApiError(400, "user not found");
  const userVerified = await user.verifyPassword(password);
  if (!userVerified) throw new ApiError(401, "Invalid user credentials.");
  //generate access and refresh tokens
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id,
    rememberMe
  );
  if (!accessToken || !refreshToken)
    throw new ApiError(500, "error occurred while generating tokens");
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );
  const options = { httpOnly: true, secure: true, sameSite: "Strict" };
  return res
    .status(202)
    .cookie("accessToken", accessToken, {
      ...options,
      maxAge: parseInt(process.env.ACCESS_TOKEN_EXPIRY_MS),
    })
    .cookie("refreshToken", refreshToken, {
      ...options,
      maxAge: rememberMe
        ? 3 * parseInt(process.env.REFRESH_TOKEN_EXPIRY_MS)
        : parseInt(process.env.REFRESH_TOKEN_EXPIRY_MS),
    })
    .json(new ApiResponse(202, "Logged in", { user: loggedInUser }));
});

const logoutUser = asyncHandler(async (req, res) => {
  const { refreshToken } = req.cookies;
  const options = { httpOnly: true, secure: true, sameSite: "Strict" };
  if (refreshToken) {
    const decoded = await jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET,
      {
        ignoreExpiration: true,
      }
    );
    if (!decoded.rememberMe) {
      const user = await User.findById(decoded.id);
      if (user) {
        user.refreshToken = null;
        await user.save({ validateBeforeSave: false });
      }
      return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, "Logged out"));
    }
  }
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .json(new ApiResponse(200, "Logged out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.cookies;
  if (!refreshToken) throw new ApiError(401, "No refresh token");
  try {
    const decoded = await jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    //jwt.verify it => if false then logout/login again
    //fetch the payload(userId) from decoded token
    const user = await User.findById(decoded.id);
    if (!user || !(await bcrypt.compare(refreshToken, user.refreshToken))) {
      throw new ApiError(401, "Invalid refresh token");
    }
    //generate new access token
    const newAccessToken = await user.generateAccessToken();
    const options = { httpOnly: true, secure: true, sameSite: "Strict" };
    const userResponse = { ...user._doc };
    delete userResponse.password;
    delete userResponse.refreshToken;
    return res
      .status(201)
      .cookie("accessToken", newAccessToken, {
        ...options,
        maxAge: parseInt(process.env.ACCESS_TOKEN_EXPIRY_MS),
      })
      .json(new ApiResponse(201, "Token refreshed", { userResponse }));
  } catch (err) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }
});

const forgetMe = asyncHandler(async (req, res) => {
  const { refreshToken } = req.cookies;
  if (refreshToken) {
    const decoded = await jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET,
      { ignoreExpiration: true }
    );
    const user = await User.findById(decoded.id);
    if (user) {
      user.refreshToken = null;
      await user.save({ validateBeforeSave: false });
    }
  }
  const options = { httpOnly: true, secure: true, sameSite: "Strict" };
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(201, "All sessions cleared"));
});

const changePassword = asyncHandler(async (req, res) => {
  const { currPassword, newPassword } = req.body;
  const loggedInUser = await User.findById(req.user?._id);
  if (!(await loggedInUser.verifyPassword(currPassword)))
    throw new ApiError(401, "current password is incorrect");
  loggedInUser.password = newPassword;
  await loggedInUser.save({ validateBeforeSave: false });
  return res
    .status(200)
    .json(new ApiResponse(200, "password changed succesfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res.status(200).json(
    new ApiResponse(200, "current user details fetched successfully", {
      currentUser: req.user,
    })
  );
});

const getSavedUser = asyncHandler(async (req, res) => {
  const { refreshToken } = req.cookies;
  if (!refreshToken) throw new ApiError(401, "No refresh token");

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    if (!decoded.rememberMe) throw new ApiError(401, "No saved user");
    const user = await User.findById(decoded.id).select(
      "avatar email fullName refreshToken"
    );
    if (!user || !(await bcrypt.compare(refreshToken, user.refreshToken))) {
      throw new ApiError(401, "Invalid refresh token");
    }
    const payload = {
      avatar: user.avatar,
      email: user.email,
      fullName: user.fullName,
    };
    return res.status(200).json(new ApiResponse(200, "", payload));
  } catch (err) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { email: newEmail } = req.body;
  if (!newEmail) throw new ApiError(400, "New email not supplied");
  const doesEmailExist = await User.exists({ email: newEmail });
  if (doesEmailExist)
    throw new ApiError(400, "Email already exists! Enter a unique one");
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: { email: newEmail },
    },
    { new: true }
  ).select("-password -refreshToken");
  return res
    .status(201)
    .json(new ApiResponse(201, "account details updated successfully!", user));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const newAvatarLocalPath = req.file?.path;
  if (!newAvatarLocalPath)
    throw new ApiError(400, "error saving avatar to disk");
  //delete old
  await deleteFromUrl(req.user?.avatar);
  const uploadedAvatar = await upload(newAvatarLocalPath);
  if (!uploadedAvatar.url)
    throw new ApiError(400, "error saving avatar to cloudinary");
  const updatedUser = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: { avatar: uploadedAvatar.url },
    },
    { new: true }
  ).select("-password -refreshToken");
  return res.status(201).json(
    new ApiResponse(201, "avatar updated successfully!", {
      user: updatedUser,
    })
  );
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  //req.user //req.params
  //get -> user's subscribers(from "Subscription"), subscribedTo(from "Subscription"), isSubscribed(check req.user in "subscribers")
  //along with other details(username,avatar,email from "User")
  if (!req.params?.username) throw new ApiError(400, "username is missing");
  // const searchedUser = await User.findOne({ username: req.params?.username })
  // if(!searchedUser) throw new ApiError(404,"user not found")
  //aggregation pipelines starts from here
  const channel = await User.aggregate([
    {
      $match: { username: req.params?.username },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "_id",
        foreignField: "owner",
        as: "videosUploaded",
        pipeline: [
          {
            $match: {
              isPublished: true, // Filter for only published videos
            },
          },
        ],
      },
    },
    {
      $project: {
        username: 1,
        fullName: 1,
        avatar: 1,
        email: 1,
        videosUploaded: {
          $size: "$videosUploaded",
        },
        subscribers: {
          $size: "$subscribers",
        },
        subscribedTo: {
          $size: "$subscribedTo",
        },
        isSubscribed: {
          $cond: {
            if: {
              $in: [req.user?._id, "$subscribers.subscriber"],
            },
            then: true,
            else: false,
          },
        },
      },
    },
  ]);
  if (!channel?.length) {
    throw new ApiError(404, "channel does not exists");
  }
  return res
    .status(200)
    .json(
      new ApiResponse(200, "channel details fetched successfully", channel[0])
    );
});

const getWatchHistory = asyncHandler(async (req, res) => {
  const watchHistory = await User.aggregate([
    {
      $match: {
        _id: req.user?._id,
      },
    },
    {
      $unwind: {
        path: "$watchHistory",
        preserveNullAndEmptyArrays: false, // Don't Keep users with empty watchHistory
      },
    },
    // Perform the lookup to get video details
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory.videoId",
        foreignField: "_id",
        as: "watchHistory.video", // Temporarily store video data here
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    username: 1,
                    fullName: 1,
                    avatar: 1,
                    email: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: { $first: "$owner" },
            },
          },
        ],
      },
    },
    // Unwind the video array (since $lookup returns an array)
    {
      $unwind: {
        path: "$watchHistory.video",
        preserveNullAndEmptyArrays: true, // Handle cases where no video matches
      },
    },
    {
      $addFields: {
        "watchHistory.localViewedOn": {
          $subtract: ["$watchHistory.viewedOn", "$watchHistory.timezoneOffset"],
        },
      },
    },
    {
      $group: {
        _id: {
          $dateTrunc: { date: "$watchHistory.localViewedOn", unit: "day" },
        },
        watchHistory: {
          $push: {
            video: "$watchHistory.video",
            viewedOn: "$watchHistory.viewedOn", // Include viewedOn for sorting
          },
        },
      },
    },
    // Sort the watchHistory array within each group
    {
      $project: {
        _id: 1,
        watchHistory: {
          $map: {
            input: {
              $sortArray: {
                input: "$watchHistory",
                sortBy: { viewedOn: -1 }, // Sort by viewedOn descending
              },
            },
            as: "item",
            in: "$$item.video", // Extract only the video field
          },
        },
      },
    },
    { $sort: { _id: -1 } },
  ]);
  return res
    .status(200)
    .json(
      new ApiResponse(200, "Watch history fetched successfully", watchHistory)
    );
});

export {
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
};
