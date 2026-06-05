import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fixmerahRouter from "./fixmerah";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/fixmerah", fixmerahRouter);

export default router;
