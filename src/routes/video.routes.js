import { Router } from "express";
import { isLoggedIn } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";
import {
  deleteVideo,
  getAllVideos,
  getVideoById,
  publishAVideo,
  togglePublishStatus,
  updateVideo,
} from "../controllers/video.controller.js";

const router = Router();
router.route("/all").get(getAllVideos);
router
  .route("/publish")
  .post(
    isLoggedIn,
    upload.fields([{ name: "video" }, { name: "thumbnail" }]),
    publishAVideo
  );
router
  .use(isLoggedIn)
  .route("/:videoId")
  .get(getVideoById)
  .patch(upload.single("thumbnail"), updateVideo)
  .delete(deleteVideo);
router.route("/togglePublish/:videoId").patch(isLoggedIn, togglePublishStatus);

export default router;
