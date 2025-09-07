chrome.action.onClicked.addListener((tab)=>{
if(!tab?.id) return;
chrome.tabs.sendMessage(tab.id, {__fisheye:true, cmd:'toggle-warp'});
});


chrome.commands.onCommand.addListener((command)=>{
chrome.tabs.query({active:true, currentWindow:true}, (tabs)=>{
const tab = tabs[0]; if(!tab?.id) return;
chrome.tabs.sendMessage(tab.id, {__fisheye:true, cmd:command});
});
});