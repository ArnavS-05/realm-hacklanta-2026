import 'dotenv/config';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { handleOperation } from './handler.js';
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'4mb'}));app.use('/api',rateLimit({windowMs:60000,limit:12,standardHeaders:true,legacyHeaders:false}));
app.get('/api/health',(_req,res)=>res.json({ok:true,geminiConfigured:Boolean(process.env.GEMINI_API_KEY)}));
app.post('/api/:operation',async(req,res)=>{const result=await handleOperation(String(req.params.operation),req.body);res.status(result.status).json(result.data);});
app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.status===413?413:400).json({error:'Request could not be parsed or exceeds 4 MB.'}));
app.listen(3001,'127.0.0.1',()=>console.log('REALM API http://127.0.0.1:3001'));
