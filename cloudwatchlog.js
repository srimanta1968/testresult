const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");

const region = process.env.awsregion;
const logGroupName = `/ecs/${process.env.CONTAINER_NAME}-${process.env.suiteid}`;
const logStreamName = `ecs/${process.env.CONTAINER_NAME}`; // Ensure this matches your log configuration
const bucketName = process.env.bucket;
const reportPath = process.env.reportpath;
const containerName = process.env.CONTAINER_NAME;
const suiteId = process.env.suiteid;

console.log("suiteId=" + suiteId);

console.log("bucketName=" + bucketName);

AWS.config.update({ region: region });

const cloudWatchLogs = new AWS.CloudWatchLogs();

async function getLogEvents() {
  try {
    const params = {
      logGroupName,
      logStreamName,
      startFromHead: true,
    };

    const data = await cloudWatchLogs.getLogEvents(params).promise();
    console.log("Log events:", data.events);

    const logData = data.events.map((event) => event.message).join("\n");
    const logFilePath = path.join(reportPath, "cloudwatch-logs.txt"); // Adjust the path as needed

    fs.writeFileSync(logFilePath, logData, "utf8");
    console.log("Logs saved to:", logFilePath);

    // Upload the logs to S3
    const s3 = new AWS.S3();
    const keyName = `logs/${containerName}_${suiteId}.log`;

    await s3
      .putObject({
        Bucket: bucketName,
        Key: keyName,
        Body: logData,
      })
      .promise();

    console.log("Log file successfully uploaded to S3:", keyName);

    const s3Url = `https://${bucketName}.s3.${region}.amazonaws.com/${keyName}`;
    console.log("Access the log file at:", s3Url);
  } catch (error) {
    console.error("Error fetching logs:", error);
  }
}

getLogEvents();
