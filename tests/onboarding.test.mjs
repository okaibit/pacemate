import test from 'node:test';
import assert from 'node:assert/strict';
import {ONBOARDING_STEPS,onboardingAge,validateOnboardingStep,onboardingPayload,onboardingPreview} from '../src/onboarding.js';
const today=new Date('2026-11-08T12:00:00Z');
const form=()=>({name:' Alex ',birthdate:'1998-02-28',gender:'Man',interestedIn:['Woman'],ageMin:18,ageMax:45,goal:'A training partner',sports:['Running'],level:'',routine:'',homeCity:' Abuja ',currentCity:'',bio:'Sunday runs.',photos:['member-a/photo.jpg']});
test('onboarding rejects invalid dates and underage birthdays at the UTC boundary',()=>{
 assert.equal(onboardingAge('2008-11-08',today),18);assert.equal(onboardingAge('2008-11-09',today),17);
 assert.equal(onboardingAge('2000-02-30',today),null);
 assert.equal(validateOnboardingStep('birthdate',{birthdate:'2008-11-08'},today),'');
 assert.match(validateOnboardingStep('birthdate',{birthdate:'2008-11-09'},today),/18 or older/);
 assert.match(validateOnboardingStep('birthdate',{birthdate:'1900-01-01'},today),/valid date/);
});
test('all required answers pass before review and optional fields may remain empty',()=>{
 const f=form();for(const step of ONBOARDING_STEPS)assert.equal(validateOnboardingStep(step.key,f,today),'',step.key);
 assert.equal(ONBOARDING_STEPS.at(-1).key,'review');
 for(const key of ['name','gender','goal','interestedIn','sports','city']){
  const invalid={...f,name:'',gender:'',goal:'',interestedIn:[],sports:[],homeCity:''};assert.notEqual(validateOnboardingStep(key,invalid,today),'',key);
 }
});
test('sports and dating ranges reject unsupported or out-of-range selections',()=>{
 const f=form();
 for(const sports of [[],['Running','Running'],['Invented sport']])assert.notEqual(validateOnboardingStep('sports',{...f,sports}),'');
 for(const ages of [{ageMin:17,ageMax:45},{ageMin:50,ageMax:40},{ageMin:18,ageMax:100},{ageMin:18.5,ageMax:45}])assert.notEqual(validateOnboardingStep('ages',{...f,...ages}),'');
});
test('public preview omits birthdate and account/contact fields',()=>{
 const p=onboardingPreview({...form(),email:'private@example.test',phone:'123',address:'Private street'},today);
 assert.equal(p.age,28);assert.equal(p.name,'Alex');assert.equal(p.currentCity,'Abuja');
 for(const key of ['birthdate','email','phone','address','interestedIn','ageMin','ageMax'])assert.ok(!Object.hasOwn(p,key));
 assert.ok(!Object.hasOwn(p,'compatibility'));assert.ok(!Object.hasOwn(p,'verified'));
});
test('save payload uses existing handler fields and isolates arrays from later edits',()=>{
 const f={...form(),id:'another-member',email:'private@example.test',height:172};
 const p=onboardingPayload(f);assert.equal(p.birthdate,'1998-02-28');assert.equal(p.currentCity,'Abuja');
 for(const key of ['id','email','height'])assert.ok(!Object.hasOwn(p,key));
 f.sports.push('Gym');assert.deepEqual(p.sports,['Running']);
});
