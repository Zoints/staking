const express = require('express');
const app = express();
const port = 8080;

app.listen(port, () => {
    console.log(`Server started at http://localhost:${port}`);
});
