"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";

export default function ActionFeedback({pending=false,message="",ok=false,neutral=false,colored=false}:{pending?:boolean;message?:string;ok?:boolean;neutral?:boolean;colored?:boolean}){
  const feedbackId=useId();
  useEffect(()=>{
    if(pending||!message)return;
    const toastId=`action-feedback-${feedbackId}`;
    if(neutral)toast(message,{id:toastId,icon:"ℹ️"});
    else if(ok)toast.success(message,{id:toastId,...(colored?{style:{background:"#ecfdf5",color:"#047857"},iconTheme:{primary:"#059669",secondary:"#ffffff"}}:{})});
    else{
      const event = new CustomEvent("app:action-error", { detail: { message }, cancelable: true });
      if (!window.dispatchEvent(event)) return;
      toast.error(message,{id:toastId,...(colored?{style:{background:"#fff1f2",color:"#be123c"},iconTheme:{primary:"#e11d48",secondary:"#ffffff"}}:{})});
    }
  },[feedbackId,message,neutral,ok,pending,colored]);

  return null;
}
