const express = require("express");
const app = express();
const cors = require("cors");
const { connect } = require("./db");
const router = require("./Routes/index");
const PORT = process.env.PORT || 5001;

const corsOptions = {
  origin: ["https://internshala-beta.vercel.app", "http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.set("trust proxy", 1);
app.use(cors(corsOptions));
app.use(express.json({ limit: "50mb" }));

app.use(
  express.urlencoded({
    extended: true,
    limit: "50mb",
  }),
);

app.get("/", (req, res) => {
  res.send("hello this is internshala backend");
});
app.use("/api", router);
const startServer = async () => {
  try {
    await connect();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);

    process.exit(1);
  }
};

startServer();
