import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clinixRouter from "./clinix";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clinixRouter);

export default router;
