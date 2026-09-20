const mongoose = require("mongoose");
require("dotenv").config();

const connect = async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  console.log("Database is connected");
};

module.exports = {
  connect,
};