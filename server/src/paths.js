const path = require('path');

// Папка для фото товаров. На хостинге выносится за пределы кода, чтобы не терялась при обновлении.
const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(__dirname, '..', 'uploads');

module.exports = { UPLOAD_DIR };
