const AWS = require("aws-sdk");
const fs = require("fs");
const axios = require("axios");

// Ensure these are securely managed in production
require("dotenv").config();

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.awsregion;
const bucketName = process.env.bucket;
const containerName = process.env.containername;
const suiteId = process.env.suiteid;
const authorization = process.env.authorization;
const x_poolindex = process.env.x_poolindex;
const x_groupuser_id = process.env.x_groupuser_id;
const x_account_id = process.env.x_account_id;
const api_result_uri = process.env.api_result_uri;

AWS.config.update({
  region: region,
  accessKeyId: accessKeyId,
  secretAccessKey: secretAccessKey,
});

const readAndUploadLog = async (logFilePath, logFileName) => {
  try {
    if (fs.existsSync(logFilePath)) {
      const logData = fs.readFileSync(logFilePath, "utf8");
      const s3 = new AWS.S3();
      const keyName = `logs/${containerName}_${suiteId}_${logFileName}`;
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
      return s3Url;
    } else {
      console.error(`File ${logFilePath} does not exist.`);
    }
  } catch (error) {
    console.error(`Error reading or uploading ${logFileName}:`, error);
  }
};

const updateLogAndTestResult = async (
  testlogurl,
  scriptlogurl,
  resultlogurl,
  logFilePath
) => {
  try {
    if (fs.existsSync(logFilePath)) {
      const logData = fs.readFileSync(logFilePath, "utf8");
      let totalTest = 0;
      let passed = 0;
      let failed = 0;
      let skipped = 0;
      const logLines = logData.split("\n");
      logLines.forEach((line) => {
        if (line.includes("Scenario:")) {
          totalTest++;
        }
        if (line.includes("✖")) {
          failed++;
        }
        if (line.includes("✔")) {
          passed++;
        }
        if (line.includes("skipped") || line.includes("pending")) {
          skipped++;
        }
      });
      await updateTestResult(
        testlogurl,
        scriptlogurl,
        resultlogurl,
        totalTest,
        passed,
        failed,
        skipped
      );
    } else {
      console.error(`Log file ${logFilePath} does not exist.`);
    }
  } catch (error) {
    console.error("Error reading log file or updating test results:", error);
  }
};

const updateTestResult = async (
  testlogurl,
  scriptlogurl,
  resultlogurl,
  totalTest,
  passed,
  failed,
  skipped
) => {
  try {
    const data = {
      suiteid: suiteId,
      testlogurl: testlogurl,
      scriptlogurl: scriptlogurl,
      resulturl: resultlogurl,
      totaltestcnt: totalTest,
      passedcnt: passed,
      failedcnt: failed,
      skippedcnt: skipped,
    };
    console.log("Calling updateTestResult:", JSON.stringify(data));
    const response = await axios.post(
      `${api_result_uri}/docker/update-testresult`,
      data,
      {
        headers: {
          Authorization: `${authorization}`,
          x_account_id: x_account_id,
          x_groupuser_id: x_groupuser_id,
          x_poolindex: x_poolindex,
        },
      }
    );
    console.log("Update Test Result response:", response.data);
  } catch (error) {
    if (error.response && error.response.data.error === "Invalid token") {
      console.error("Invalid token:", error);
    } else {
      console.error("Error updating test result:", error);
    }
  }
};

const uploadAllLogs = async () => {
  try {
    const testlogurl = await readAndUploadLog(
      "/usr/scripts/testlog.log",
      "testlog.log"
    );
    const scriptlogurl = await readAndUploadLog(
      "/usr/scripts/alllogs.log",
      "alllogs.log"
    );
    const resultlogurl = await readAndUploadLog(
      "/usr/scripts/alllogs.log",
      "alllogs.log"
    );
    await updateLogAndTestResult(
      testlogurl,
      scriptlogurl,
      resultlogurl,
      "/usr/scripts/testlog.log"
    );
  } catch (error) {
    if (error.response && error.response.data.error === "Invalid token") {
      console.error("Invalid token:", error);
    } else {
      console.error("Error updating test result:", error);
    }
  }
};

uploadAllLogs();
