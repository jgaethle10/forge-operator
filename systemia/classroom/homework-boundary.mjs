// Transparent, conservative academic-integrity boundary for the private pilot.
// This is rule-based scaffolding, NOT a substitute for reviewed AI teaching or
// a certified homework verifier. Active schoolwork never reaches the generative model.
const protectedWords=/(?:\b(?:my|this|our|assigned|today's|tonight's)\s+(?:homework|worksheet|assignment|schoolwork|quiz|test|exam)\b|\b(?:teacher|school)\s+(?:gave|assigned|asked|told)\s+(?:me|us)\b|\b(?:do|solve|finish|complete)\s+(?:my|this|the)\s+(?:homework|worksheet|assignment|test|exam)\b|\b(?:answer|solution)\s+(?:to|for)\s+(?:my|this|the)\s+(?:homework|worksheet|assignment|quiz|test|exam)\b)/i;
const negation=/\b(?:no|not|don't|do not|without|never had|didn't have)\b.{0,32}\b(?:homework|worksheet|assignment|schoolwork)\b/i;
const assignmentPressure=/\b(?:tell me|give me|show me|write)\s+(?:the|my)\s+(?:final\s+)?answer\b/i;
export function activeSchoolworkDetected(message){
 if(typeof message!=='string')return false;
 return (protectedWords.test(message)&&!negation.test(message))||
   (assignmentPressure.test(message)&&/\b(?:question|problem|school|test|homework|worksheet|assignment)\b/i.test(message));
}
export function guidedHomeworkStep(message,room='math'){
 const text=String(message||'').toLowerCase();
 const title="I can help you reason through schoolwork, but I won't supply its final answer.";
 let step='';
 if(/\b(fraction|denominator|numerator|divide|division)\b/.test(text))
  step='Try drawing equal groups or parts. What is the whole, and how many equal parts do you have?';
 else if(/\b(equation|algebra|variable|solve for|unknown|x\s*[+=-])\b/.test(text))
  step='Look for the unknown quantity and the operations around it. Which operation could you undo first?';
 else if(/\b(percent|percentage|discount)\b/.test(text))
  step='First identify the whole and the part. How might you describe the part out of one hundred?';
 else if(/\b(story|reading|paragraph|character|theme|passage)\b/.test(text)||room==='reading')
  step='Find one detail in the passage that supports your idea. What does that detail tell you about the character or main point?';
 else if(/\b(experiment|science|hypothesis|prediction|variable)\b/.test(text)||room==='science')
  step='Identify what changes and what stays the same. What observation would help you check your prediction?';
 else if(room==='math')
  step='What information is given, and what are you asked to find? Tell me one step you have already tried.';
 else if(room==='language')
  step='Look at the key words in the instruction. What would your first sentence or example be?';
 else
  step='Tell me which part is confusing, and what you have already tried. We can choose one small step together.';
 return title+' '+step;
}
