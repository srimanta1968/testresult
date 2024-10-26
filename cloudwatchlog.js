const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.awsregion;
const bucketName = process.env.bucket;
const suiteId = process.env.suiteid;
const authorization = process.env.authorization;
const x_poolindex = process.env.x_poolindex;
const x_groupuser_id = process.env.x_groupuser_id;
const x_account_id = process.env.x_account_id;
const api_result_uri = process.env.api_result_uri;
const rootDir = process.env.rootDir || "/repo";
const resultFilePath = process.env.resultFilePath || ".*\\.(html|pdf)$";
const videoFilePath = process.env.videoFilePath || ".*\\.(mp4|mkv)$";

AWS.config.update({ region, accessKeyId, secretAccessKey });
const s3 = new AWS.S3();
let urls = [];

// Function to search for files recursively based on pattern
const getFiles = (dir, pattern) => {
  const regex = new RegExp(pattern);
  let results = [];
  const list = fs.readdirSync(dir);

  list.forEach((file) => {
    file = path.resolve(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(file, pattern));
    } else {
      if (regex.test(file)) {
        results.push(file);
      }
    }
  });

  return results;
};

const uploadFileToS3 = async (filePath, key) => {
  const fileContent = fs.readFileSync(filePath);
  const params = {
    Bucket: bucketName,
    Key: key,
    Body: fileContent,
  };
  await s3.upload(params).promise();
  return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
};

const readAndUploadLog = async (logFilePath, logFileName) => {
  try {
    if (fs.existsSync(logFilePath)) {
      const logData = fs.readFileSync(logFilePath, "utf8");
      const keyName = `logs/${suiteId}_${Date.now()}_${logFileName}`;
      return await uploadFileToS3(logFilePath, keyName);
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
    urls.push(testlogurl);

    const scriptlogurl = await readAndUploadLog(
      "/usr/scripts/alllogs.log",
      "alllogs.log"
    );
    urls.push(scriptlogurl);

    // Find result files recursively
    const resultFiles = getFiles(rootDir, resultFilePath);

    for (const file of resultFiles) {
      const s3Path = `${suiteId}/results/${Date.now()}_${path.basename(file)}`;
      const resultlogurl = await uploadFileToS3(file, s3Path);
      urls.push(resultlogurl);
    }

    // Find video files recursively
    const videoFiles = getFiles(rootDir, videoFilePath);

    for (const file of videoFiles) {
      const s3Path = `${suiteId}/videos/${Date.now()}_${path.basename(file)}`;
      const vediourls = await uploadFileToS3(file, s3Path);
      urls.push(vediourls);
    }

    await updateLogAndTestResult(
      testlogurl,
      scriptlogurl,
      urls.join(";"),
      "/usr/scripts/testlog.log"
    );
  } catch (error) {
    if (error.response && error.response.data.error === "Invalid token") {
      console.error("Invalid token:", error);
    } else {
      console.error("Error uploading files:", error);
    }
  }
};

// Start uploading logs
uploadAllLogs();
