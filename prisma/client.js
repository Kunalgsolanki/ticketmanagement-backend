require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const mariadb = require('mariadb');


const dbUrl = new URL((process.env.DATABASE_URL || '').replace(/^mysql:/, 'mariadb:'));

const pool = mariadb.createPool({
  host: dbUrl.hostname === 'localhost' ? '127.0.0.1' : dbUrl.hostname,
  port: Number(dbUrl.port) || 3306,
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.replace('/', ''),
  allowPublicKeyRetrieval: true,
  connectionLimit: 10,
});

const adapter = new PrismaMariaDb(pool);
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
