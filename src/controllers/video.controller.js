import mongoose, { isValidObjectId } from "mongoose";
import { Video } from "../models/video.models.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { deleteFromUrl, upload } from "../utils/cloudinary.js";
import fs from "fs";
import { Like } from "../models/like.models.js";
import { Comment } from "../models/comment.models.js";
import { User } from "../models/user.models.js";

const getAllVideos = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    query = "",
    sortBy,
    sortType = "asc",
    userId,
    showUnpublishedAlso = false,
  } = req.query;
  //TODO: get all videos based on query, sort, pagination
  const filter = { isPublished: true };

  if (showUnpublishedAlso && showUnpublishedAlso === "true") {
    delete filter.isPublished;
  }

  if (userId && isValidObjectId(userId.trim())) {
    filter["owner"] = mongoose.Types.ObjectId.createFromHexString(userId);
  }
  if (query && query.trim().length) {
    filter["$or"] = [
      { title: { $regex: query, $options: "i" } },
      { description: { $regex: query, $options: "i" } },
    ];
  }
  const sort = {};
  if (sortBy) {
    const sortByParsed = sortBy.split(",");
    sortByParsed.forEach((field) => {
      if (field) sort[field.trim()] = sortType;
    });
  }
  sort["_id"] = "asc";

  const videos = await Video.find(filter)
    .populate("owner", "avatar username fullName")
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
  const videosCount = await Video.countDocuments(filter);
  if (!videos) throw new ApiError(500, "error while fetching all videos");
  return res.status(200).json(
    new ApiResponse(
      200,
      `${!videos.length ? "no videos found for this search" : "fetched all videos successfully"}`,
      {
        videos,
        hasNextPage: page * limit < videosCount,
        totalVideos: videosCount,
      }
    )
  );
});

const publishAVideo = asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  // TODO: get video, upload to cloudinary, create video
  if (
    [title, description].some((field) => {
      return field === undefined || field === null || field?.trim() === "";
    })
  ) {
    throw new ApiError(400, "all fields are required");
  }
  const videoPath = req.files?.video[0]?.path;
  const thumbnailPath = req.files?.thumbnail[0]?.path;
  if (!videoPath) throw new ApiError(400, "video file is required");
  if (!thumbnailPath) throw new ApiError(400, "thumbnail file is required");
  const uploadedVideo = await upload(videoPath);
  if (!uploadedVideo?.url)
    throw new ApiError(500, "error while uploading video to cloudinary");
  const uploadedThumbnail = await upload(thumbnailPath);
  if (!uploadedThumbnail?.url)
    throw new ApiError(500, "error while uploading thumbnail to cloudinary");
  const newVideo = await Video.create({
    videoFile: uploadedVideo.url,
    thumbnail: uploadedThumbnail.url,
    title,
    description,
    duration: uploadedVideo.duration,
    owner: req.user?._id,
  });
  if (!newVideo) throw new ApiError(500, "error publishing a new video");
  return res
    .status(201)
    .json(new ApiResponse(201, "new video published successfully", newVideo));
});

const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  //TODO: get video by id
  if (!isValidObjectId(videoId)) throw new ApiError(400, "videoID is invalid");
  const video = await Video.aggregate([
    {
      $match: {
        _id: mongoose.Types.ObjectId.createFromHexString(videoId),
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $lookup: {
              from: "subscriptions",
              localField: "_id",
              foreignField: "channel",
              as: "subscribersList",
            },
          },
          {
            $set: {
              totalSubscribers: {
                $size: "$subscribersList",
              },
              isSubscribed: {
                $in: [req.user?._id, "$subscribersList.subscriber"],
              },
            },
          },
          {
            $project: {
              username: 1,
              fullName: 1,
              email: 1,
              avatar: 1,
              totalSubscribers: 1,
              isSubscribed: 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "video",
        as: "likesList",
      },
    },
    {
      $set: {
        owner: {
          $first: "$owner",
        },
        likesCount: {
          $size: "$likesList",
        },
        isLiked: {
          $in: [req.user?._id, "$likesList.likedBy"],
        },
      },
    },
    {
      $unset: "likesList",
    },
  ]);
  if (!video.length) throw new ApiError(500, "error while fetching video");

  if (video[0].isPublished) {
    await Video.findByIdAndUpdate(videoId, {
      $inc: {
        views: 1,
      },
    });

    await User.findByIdAndUpdate(
      req.user?._id,
      {
        $push: {
          watchHistory: {
            $each: [{ videoId }],
            $slice: -parseInt(process.env.WATCH_HISTORY_DB_LIMIT),
          },
        },
      },
      { timestamps: false }
    );
  }

  return res
    .status(200)
    .json(new ApiResponse(200, "video fetched successfully", video[0]));
});

const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!isValidObjectId(videoId)) throw new ApiError(400, "videoID is invalid");
  const videoToBeUpdated = await Video.findById(videoId);
  if (!videoToBeUpdated) throw new ApiError(400, "video doesn't exists");
  if (!videoToBeUpdated?.owner.equals(req.user?._id))
    throw new ApiError(401, "user is not authorized to update this video");
  //TODO: update video details like title, description, thumbnail
  const { title, description } = req.body;
  const newThumbnailPath = req.file?.path;
  if (
    [title, description, newThumbnailPath].every((field) => {
      return field === undefined || field === null || field?.trim() === "";
    })
  ) {
    throw new ApiError(400, "atleast one field is required for updation");
  }
  if (newThumbnailPath && fs.existsSync(newThumbnailPath)) {
    //delete old thumbnail
    await deleteFromUrl(videoToBeUpdated.thumbnail);
    //upload to cloudinary
    const uploadedThumbnail = await upload(newThumbnailPath);
    if (!uploadedThumbnail?.url)
      throw new ApiError(500, "error uploading thumbnail to cloudinary");
    videoToBeUpdated.thumbnail = uploadedThumbnail?.url;
  }
  if (title !== undefined && title !== null && title?.trim() !== "")
    videoToBeUpdated.title = title;
  if (
    description !== undefined &&
    description !== null &&
    description?.trim() !== ""
  )
    videoToBeUpdated.description = description;
  const updatedVideo = await videoToBeUpdated.save();
  if (updatedVideo !== videoToBeUpdated)
    throw new ApiError(500, "error while updating video");
  return res
    .status(201)
    .json(new ApiResponse(201, "video updated successfully", updatedVideo));
});

const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  //TODO: delete video
  if (!isValidObjectId(videoId)) throw new ApiError(400, "videoID is invalid");
  const videoToDelete = await Video.findById(videoId);
  if (!videoToDelete) throw new ApiError(400, "cannot find video to delete");
  if (!videoToDelete?.owner.equals(req.user?._id))
    throw new ApiError(401, "user is not authorized to delete this video");
  const deletionResult = await Video.deleteOne({ _id: videoToDelete?._id });
  if (deletionResult.deletedCount === 0 || !deletionResult.acknowledged)
    throw new ApiError(500, "video cannot be deleted. Please try again !!");
  await deleteFromUrl(videoToDelete.videoFile, "video"); // delete video from cloudinary
  await deleteFromUrl(videoToDelete.thumbnail); // delete thumbnail from cloudinary
  await Like.deleteMany({ video: videoId });
  await Comment.deleteMany({ video: videoId });
  //Remove from playlist also
  //Remove from watchHistory also
  // await User.updateMany(
  //   { "watchHistory.videoId": videoId },
  //   { $pull: { watchHistory: { videoId } } }
  // );

  return res
    .status(200)
    .json(new ApiResponse(200, "video deleted successfully"));
});

const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!isValidObjectId(videoId)) throw new ApiError(400, "videoID is invalid");
  const video = await Video.findById(videoId);
  if (!video) throw new ApiError(400, "cannot find video");
  if (!video?.owner.equals(req.user?._id))
    throw new ApiError(401, "user is not authorized to change publish status");
  video.isPublished = !video.isPublished;
  const updatedVideo = await video.save({ validateBeforeSave: false });
  if (updatedVideo !== video)
    throw new ApiError(500, "error while changing publish status");
  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        `Video successfully ${updatedVideo.isPublished ? "published" : "unpublished"}`,
        updatedVideo
      )
    );
});

export {
  getAllVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
};
