const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const https = require('https'); // or 'http' for non-HTTPS URLs
const url = require('url');

const app = express();
const PORT = 3010;

// Set up Multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Load client secrets from a local file
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

async function authenticate() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_id, client_secret, redirect_uris } = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Check if token exists
  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));

    // Check if the token is expired
    if (oAuth2Client.isTokenExpiring()) {
      console.log('Token is expired or about to expire. Refreshing token...');

      // Refresh the access token using the refresh token
      oAuth2Client.refreshAccessToken((err, tokens) => {
        if (err) {
          console.error('Error refreshing access token:', err);
          return;
        }

        // Save the new tokens (including the new access token) to the token file
        console.log('Token refreshed successfully!');
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        oAuth2Client.setCredentials(tokens); // Set new credentials with the refreshed token
      });
    }
  }

  return oAuth2Client;
}

// Upload file to Google Drive
async function uploadFile(auth, filePath, fileName) {
  const drive = google.drive({ version: 'v3', auth });
  const fileMetadata = { name: fileName };
  const media = {
    mimeType: 'application/octet-stream',
    body: fs.createReadStream(filePath),
  };

  const response = await drive.files.create({
    resource: fileMetadata,
    media,
    fields: 'id',
  });

  return response.data;
}

app.get('/', (req, res) => {
  const filePath = path.join(__dirname, 'index.html'); // Path to your HTML file
  res.sendFile(filePath); // Send the HTML file as the response
});

// Route to handle file upload
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const auth = await authenticate();
    const { path: filePath, originalname: fileName } = req.file;

    const fileData = await uploadFile(auth, filePath, fileName);

    const peopleService = google.people({ version: 'v1', auth });

    const people = await peopleService.people.get({
      resourceName: 'people/me',
      personFields:
        'names,emailAddresses,photos,phoneNumbers,organizations,addresses,birthdays,genders,imClients,externalIds,skills,biographies,urls,metadata',
    });

    console.log('User Info:');
    console.log('Name:', people.data.names[0].displayName);
    console.log('Email:', people.data.emailAddresses?.toString());

    res.send(
      `Hi! ${people.data.names[0].displayName}, File uploaded successfully! File ID: ${fileData.id}`
    );

    // Cleanup uploaded file
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Error uploading file.');
  }
});

app.get('/authenticate', async (req, res) => {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_id, client_secret, redirect_uris } = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  });

  console.log(`Redirecting to authorization URL: ${authUrl}`);

  setTimeout(() => {
    res.redirect(authUrl);
  }, 2000);
});

app.get('/googleCallback', async (req, res) => {
  const parsedUrl = url.parse(req.url, true); // `true` parses the query string into an object
  const queryParams = parsedUrl.query;

  console.log(`queryParams : code: ${queryParams?.code} `);

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_id, client_secret, redirect_uris } = credentials.web;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  const token = (await oAuth2Client.getToken(queryParams?.code)).tokens;
  oAuth2Client.setCredentials(token);

  // Save the token to token.json
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
  console.log('Token saved to token.json');

  // // Save the token to token.js
  // const tokenJSContent = `module.exports = ${JSON.stringify(token, null, 2)};`;
  // fs.writeFileSync(path.join(__dirname, 'token.js'), tokenJSContent);
  // console.log('Token saved to token.js');

  res.status(200).send('OK.');
  //res.redirect('/getToken');
  //  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
  console.log('To upload a file, visit the above URL and use the form.');
});
