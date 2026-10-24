// Confirmed by Smerch: invoice bases and other accounting enquiries.
export function accountantEmail(env=process.env){
 return env.SMERCH_ACCOUNTANT_EMAIL?.trim()||'trykeksperten@financialoutsourcing.dk';
}
