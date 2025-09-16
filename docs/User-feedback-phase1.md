Review issues that need to be fixed:

#Profile edit link:
- Profile edit link generation is not creating a link and is not using the current domain. It works correctly in dev but not production.
- Generated email should end after "thank you,"

# Profile form:
- Change the dropdown values for the "Level of Technology" enumeration values to [PC,MAC,Chrome book,Linux,Other]

# Bulk import:
- need to enforce existence of an email in the school email field 
- need to enforce existence of an email if the parent name is filled in.
- Data values for the import should be the same as the drop-down fields in the profile form then translate to their enumeration value in the db.
- Change the "Level of Technology" enumeration values to [PC,MAC,Chrome book,Linux,Other]

# Teams management
- A user imported competitors but they do not show in the available to add to teams list in the team management page. However, you can add them with the team button on the competitors list. 

# Release management:
- can we validate the parent email before trigering the zoho initiation? 
- we need basic instructions in the head section one for digital send and one for manual send. Itemize the process for the manual release. 

# Coach profile page:
- remove division
- make school name read only (comes from the Monday Coach initialization)