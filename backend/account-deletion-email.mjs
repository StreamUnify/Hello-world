import nodemailer from 'nodemailer';

const supportEmail='support@streamunify.com';
const subject='Your StreamUnify account was deleted';
const text=`Your StreamUnify account has been deleted.

Deleting your account does not cancel a subscription. If you still have an active subscription, manage it through the service where you purchased it.

If you did not request this deletion or have questions, contact us at ${supportEmail}.

StreamUnify`;

export function createAccountDeletionEmail({env=process.env,createTransport=nodemailer.createTransport}={}){
  const password=env.ACCOUNT_DELETION_SMTP_PASSWORD;
  if(!password)return null;

  const transport=createTransport({
    host:'mail.privateemail.com',
    port:465,
    secure:true,
    auth:{user:supportEmail,pass:password},
    dnsTimeout:3000,
    connectionTimeout:5000,
    greetingTimeout:5000,
    socketTimeout:10000,
    disableFileAccess:true,
    disableUrlAccess:true
  });

  const send=async email=>{
    if(typeof email!=='string'||!/^[^\s@,;<>"]+@[^\s@,;<>"]+$/.test(email))throw Error('Invalid account email');
    const result=await transport.sendMail({
      from:{name:'StreamUnify',address:supportEmail},
      to:{address:email},
      subject,
      text
    });
    if(!result.accepted?.length)throw Error('Account deletion email was not accepted');
  };
  send.verify=()=>transport.verify();
  return send;
}

export async function checkAccountDeletionEmail(send,log=console){
  if(!send){log.warn('Account deletion email: SMTP credential is missing');return;}
  try{
    await send.verify();
    log.info('Account deletion email: SMTP connection and authentication verified');
  }catch(error){
    const reason=error?.code==='EAUTH'?'authentication rejected':'connection or TLS check failed';
    log.warn('Account deletion email: SMTP '+reason);
  }
}
