# Cado

Cado is a work-in-progress chat application built with Node.js, Express, EJS, MongoDB, Socket.IO and Capacitor/Android.

## Requirements

- Node.js
- MongoDB running locally, or a MongoDB connection string in `MONGODB_URI`

## Setup

```bash
npm install
npm start
```

By default the server starts at:

```text
http://localhost:3000
```

Optional environment variables:

```text
PORT=3000
HOST=localhost
MONGODB_URI=mongodb://localhost:27017/chatapp
JWT_SECRET=replace-with-a-strong-secret
```

## Android Build

```bash
npm run build
```
