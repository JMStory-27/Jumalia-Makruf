import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = [
        /^https?:\/\/localhost(:\d+)?$/,
        /^https?:\/\/.*\.replit\.dev$/,
        /^https?:\/\/.*\.replit\.app$/,
        /^https?:\/\/.*\.pike\.replit\.dev$/,
        /^https?:\/\/jmstory-27\.github\.io$/,
        /^https?:\/\/.*\.github\.io$/,
      ];
      if (!origin || allowed.some((r) => r.test(origin))) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    credentials: false,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api", router);

export default app;
