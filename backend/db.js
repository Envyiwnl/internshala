const mongoose = require("mongoose");
require("dotenv").config();
database = process.env.MONGODB_URI;
const url = database;
module.exports.connect = () => {
  mongoose.connect(url, console.log("Databse is connected"));
};
