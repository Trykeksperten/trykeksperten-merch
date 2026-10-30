import Database from 'better-sqlite3';
import {mkdirSync,readFileSync,readdirSync,chmodSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dataPath} from '../data-path.mjs';
const connections=new Map();
export const databaseEnabled=()=>process.env.SMERCH_DATABASE_ENABLED==='1';
export function db(){const path=dataPath('smerch.sqlite');if(connections.has(path))return connections.get(path);mkdirSync(dataPath(),{recursive:true,mode:0o700});const connection=new Database(path);connection.pragma('foreign_keys = ON');connection.pragma('journal_mode = WAL');connection.pragma('synchronous = FULL');connection.pragma('busy_timeout = 5000');connection.exec('CREATE TABLE IF NOT EXISTS migrations(version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)');const root=fileURLToPath(new URL('../../migrations/',import.meta.url));for(const filename of readdirSync(root).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){const sql=readFileSync(root+'/'+filename,'utf8'),checksum=createHash('sha256').update(sql).digest('hex'),previous=connection.prepare('SELECT checksum FROM migrations WHERE version=?').get(filename);if(previous){if(previous.checksum!==checksum)throw Error('Database migration checksum mismatch');continue;}connection.transaction(()=>{connection.exec(sql);connection.prepare('INSERT INTO migrations VALUES(?,?,?)').run(filename,checksum,new Date().toISOString());}).immediate();}chmodSync(path,0o600);connections.set(path,connection);return connection;}
export const transaction=fn=>db().transaction(fn).immediate();
export function closeDatabases(){for(const connection of connections.values())connection.close();connections.clear();}
export function audit(actor,entityType,id,action,details={}){db().prepare('INSERT INTO audit(company_id,actor_id,entity_type,entity_id,action,at,details_json) VALUES(?,?,?,?,?,?,?)').run(actor.companyId,actor.id,entityType,id,action,new Date().toISOString(),JSON.stringify(details));}
export function databaseHealth(){const connection=db();return {integrity:connection.pragma('quick_check',{simple:true})==='ok',pendingJobs:connection.prepare("SELECT count(*) n FROM jobs WHERE status IN ('queued','running')").get().n,failedJobs:connection.prepare("SELECT count(*) n FROM jobs WHERE status IN ('failed','uncertain')").get().n,schema:connection.prepare('SELECT version FROM migrations ORDER BY version').all().map(r=>r.version)};}

export function assertStorageMode(){if(!databaseEnabled()&&existsSync(dataPath('smerch.sqlite')))throw Error('SQLite-data findes. Start med SMERCH_DATABASE_ENABLED=1; skift ikke tilbage til gamle JSON-filer.');}
