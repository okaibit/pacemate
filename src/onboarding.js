import {GENDERS,GOALS,SPORTS,LEVELS,ROUTINES} from './options.js';
export const CONNECTION_MODES=Object.freeze(['dating','training_partner','friendship']);
export const ONBOARDING_STEPS = [
 {key:'name',title:'What should we call you?',description:'Your name appears on your profile.'},
 {key:'birthdate',title:'When is your birthday?',description:'You must be 18 or older. Other members see your age only.'},
 {key:'gender',title:'How do you identify?'},
 {key:'connectionModes',title:'Who are you hoping to meet?',description:'Date someone who shares your pace. You can also choose Play or Friend, or select more than one.'},
 {key:'goal',title:'What are you looking for?',description:'Choose what best describes your intentions.'},
 {key:'interestedIn',title:'Who would you like to date?',description:'Choose one or more.'},
 {key:'ages',title:'What age range works for you?',description:'Your dating preferences.'},
 {key:'sports',title:'What moves you?',description:'Choose up to eight sports.'},
 {key:'level',title:'Where are you with your training?',optional:true},
 {key:'routine',title:'When do you usually train?',optional:true},
 {key:'city',title:'Where are you based?',description:'Only your city appears on your profile.'},
 {key:'photos',title:'Put a face to your pace.',description:'Your first photo appears first on your profile.',optional:true},
 {key:'bio',title:'What would you like people to know?',description:'A favourite route, a training goal or your ideal weekend.',optional:true},
 {key:'review',title:'Take a look.',description:'Your profile as other members will see it.'},
];
export function onboardingAge(birthdate,today=new Date()) {
 const date=new Date(birthdate+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)||isNaN(date.getTime())||date.toISOString().slice(0,10)!==birthdate)return null;
 let age=today.getUTCFullYear()-date.getUTCFullYear();
 if(today.getUTCMonth()<date.getUTCMonth()||(today.getUTCMonth()===date.getUTCMonth()&&today.getUTCDate()<date.getUTCDate()))age--;
 return age;
}
export function validateOnboardingStep(key,f,today=new Date()) {
 switch(key){
  case 'name':return f.name.trim().length>=2&&f.name.trim().length<=30?'':'Enter a name between 2 and 30 characters.';
  case 'birthdate':{
   const age=onboardingAge(f.birthdate,today);
   return age===null?'Enter a valid date of birth.':age<18?'You must be 18 or older to use Pacemate.':age>100?'Enter a valid date of birth.':'';
  }
  case 'gender':return GENDERS.includes(f.gender)?'':'Choose your gender.';
  case 'connectionModes':return Array.isArray(f.connectionModes)&&f.connectionModes.length>0&&f.connectionModes.length<=3&&new Set(f.connectionModes).size===f.connectionModes.length&&f.connectionModes.every(m=>CONNECTION_MODES.includes(m))?'':'Choose at least one intention.';
  case 'goal':return GOALS.includes(f.goal)&&(f.connectionModes?.includes('dating')||!['A relationship','Something casual'].includes(f.goal))?'':'Choose what brings you here.';
  case 'interestedIn':return !f.connectionModes?.includes('dating')||f.interestedIn.length&&f.interestedIn.every(g=>GENDERS.includes(g))?'':'Choose at least one gender.';
  case 'ages':return !f.connectionModes?.includes('dating')||Number.isInteger(f.ageMin)&&Number.isInteger(f.ageMax)&&f.ageMin>=18&&f.ageMax<=99&&f.ageMin<=f.ageMax?'':'Choose an age range between 18 and 99.';
  case 'sports':return f.sports.length>=1&&f.sports.length<=8&&new Set(f.sports).size===f.sports.length&&f.sports.every(s=>SPORTS.includes(s))?'':'Choose one to eight different sports.';
  case 'level':return !f.level||LEVELS.includes(f.level)?'':'Choose a valid experience level.';
  case 'routine':return !f.routine||ROUTINES.includes(f.routine)?'':'Choose a valid training time.';
  case 'city':return f.homeCity.trim()&&f.homeCity.trim().length<=60&&f.currentCity.trim().length<=60?'':'Enter your city, using up to 60 characters.';
  case 'photos':return f.photos.length<=6?'':'Choose up to six photos.';
  case 'bio':return f.bio.length<=500?'':'Keep your bio within 500 characters.';
  default:return '';
 }
}
export function onboardingPayload(f){
 const {name,birthdate,gender,interestedIn,ageMin,ageMax,goal,sports,level,routine,homeCity,currentCity,bio,photos}=f;
 const dating=f.connectionModes.includes('dating');
 return {...(f.countryCode?{countryCode:f.countryCode}:{}),name:name.trim(),birthdate,gender,connectionModes:[...f.connectionModes],interestedIn:dating?[...interestedIn]:[],ageMin:dating?ageMin:18,ageMax:dating?ageMax:60,goal,sports:[...sports],level,routine,homeCity:homeCity.trim(),currentCity:currentCity.trim()||homeCity.trim(),bio,photos:[...photos]};
}
// The preview uses the public shape. Private account fields and birthdate stay out.
export function onboardingPreview(f,today=new Date()){
 return {id:'onboarding-preview',name:f.name.trim(),age:onboardingAge(f.birthdate,today),gender:f.gender,goal:f.goal,connection_modes:[...(f.connectionModes||[])],sports:[...f.sports],level:f.level,routine:f.routine,homeCity:f.homeCity.trim(),currentCity:f.currentCity.trim()||f.homeCity.trim(),bio:f.bio,photos:[...f.photos]};
}
