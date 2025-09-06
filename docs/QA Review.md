Coach Context view

1. Reply Privately Button
    * Throw a 403 error when clicked. Goes nowhere
    
2. Start Direct Message
	* pop-up list box should not have a Cancel and Start DM button. There is an close "X" in the top righ corner. Remove those buttons and start DM from the button on the selected item. 
	* Start DM button throws a 403 error. Goes nowhere
	
3. Start Group button 
	* Throws this error: {"error":"Could not find a relationship between 'conversation_members' and 'profiles' in the schema cache"}
	* Button is dead - Needs to appear like a link or button. (UI Style patter for app)   
	
Admin Context View

1. If first item in the conversations list has an unread message it is cleared on load when that row receives the default focus. Read message should only be cleared when an item manually loses focus. (click)

2. Start New Message
	* Admin context should allow selection of several or all of the users listed. 
	* Items should not have a start DM button but a checkbox selector
	* Top right "X" should not be on this dialogue
	* Cancel and Start Message are valid buttons for this context
	* Currently, clicking on any of the buttons does nothing. No errors just nothing. 
	
3. Admin Tools Drop-down
	* should only show name, role, mute/un-mute action icon, message action icon. 
	* Get rid of the big ugly DM button. 
	
4. Broadcast
	* When message is sent it does not appear in the conversations list. Need a react refresh. 
	* Broadcast message is showing in coach context as a DM. 
	* Remove the note next to the Messages title "Markdown supported"
	* Start Group from this and Show participants both throw this error and do nothing. error	"Could not find a relationship between 'conversation_members' and 'profiles' in the schema cache"
	* These should only show if the current message is a group or announcement. 
	
General System Issues
	* Each DM CONVERSATION, Broadcast should show as a separate item in the CONVERSATIONS listing. The responses in the CONVERSATION thread should appear in the message panel. Currently ALL responses to ALL DMs are in the DM conversaation item and ALL the ANNOUNCEMENT are showing in a songle ANNOUNCEMENT conversation. 	