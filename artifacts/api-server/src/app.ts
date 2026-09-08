import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import stripeWebhookRouter from "./routes/stripe-webhook";
import { logger } from "./lib/logger";

const app: Express = express();

app.disable("x-powered-by");

app.use(helmet());

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000").split(",");
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) cb(null, true);
      else cb(new Error("CORS not allowed"));
    },
    credentials: true,
  }),
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many requests, please try again later" },
});
const apiLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 300 });

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

// Mounted before express.json(): Stripe webhook signature verification
// needs the raw request body, not the parsed-and-restringified JSON every
// other route gets below.
app.use("/api", stripeWebhookRouter);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);
app.use("/api", router);

// Global error handler — without this, any uncaught error (including CORS
// rejections, which the `cors` package surfaces by calling next(err)) falls
// through to Express's default HTML error page instead of JSON. Every
// frontend fetch call expects JSON, so an HTML response manifests as
// "Unexpected token '<', <!DOCTYPE...' is not valid JSON" — a misleading
// error that looks like a network/parsing bug but is actually this.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  if (res.headersSent) return;
  res.status(err?.status ?? 500).json({ error: err?.message ?? "Internal server error" });
});

export default app;
