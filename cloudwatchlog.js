const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");

// Credentials (ensure these are securely managed in production)
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.awsregion;
const bucketName = process.env.bucket;
const reportPath = process.env.reportpath;
const containerName = process.env.containername;
const suiteId = process.env.suiteid;

AWS.config.update({
  region: region,
  accessKeyId: accessKeyId,
  secretAccessKey: secretAccessKey,
});

const readAndUploadLog = async (logFileName) => {
  try {
    const logFilePath = path.join("/repo", logFileName); // Path to the log file
    const logData = fs.readFileSync(logFilePath, "utf8"); // Read the log file
    const s3 = new AWS.S3();
    const keyName = `logs/${containerName}_${suiteId}_${logFileName}`; // Unique S3 key for each log file
    await s3
      .putObject({
        Bucket: bucketName,
        Key: keyName,
        Body: logData,
      })
      .promise();
    const s3Url = `https://${bucketName}.s3.${region}.amazonaws.com/${keyName}`;
    console.log("Log file successfully uploaded to S3:", keyName);
    console.log("Access the log file at:", s3Url);
  } catch (error) {
    console.error(`Error reading or uploading ${logFileName}:`, error);
  }
};

const uploadAllLogs = async () => {
  await readAndUploadLog("testlog.log"); // Upload testlog.log
  await readAndUploadLog("alllogs.log"); // Upload alllogs.log
};

uploadAllLogs();
