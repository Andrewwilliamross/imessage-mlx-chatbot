-- Simple iMessage AppleScript Handler
-- Handles basic operations for the simplified relay

on run argv
    if (count of argv) < 1 then
        return "Error: No operation specified"
    end if

    set operation to item 1 of argv

    if operation starts with "operation=" then
        set operation to text 11 thru -1 of operation
    end if

    try
        if operation is "test_access" then
            return testAccess()
        else if operation is "send_text" then
            if (count of argv) < 3 then
                return "Error: send_text requires recipient and message"
            end if
            set recipient to getArgValue(argv, "recipient")
            set messageText to getArgValue(argv, "message")
            return sendTextMessage(recipient, messageText)
        else if operation is "send_sms" then
            if (count of argv) < 3 then
                return "Error: send_sms requires recipient and message"
            end if
            set recipient to getArgValue(argv, "recipient")
            set messageText to getArgValue(argv, "message")
            return sendSMSMessage(recipient, messageText)
        else if operation is "send_media" then
            if (count of argv) < 3 then
                return "Error: send_media requires recipient and file path"
            end if
            set recipient to getArgValue(argv, "recipient")
            set messageText to getArgValue(argv, "message")
            set filePath to getArgValue(argv, "file")
            return sendMediaMessage(recipient, messageText, filePath)
        else if operation is "send_mms" then
            if (count of argv) < 3 then
                return "Error: send_mms requires recipient and file path"
            end if
            set recipient to getArgValue(argv, "recipient")
            set messageText to getArgValue(argv, "message")
            set filePath to getArgValue(argv, "file")
            return sendSMSMediaMessage(recipient, messageText, filePath)
        else if operation is "get_conversations" then
            set conversationLimit to 50
            if (count of argv) > 1 then
                set conversationLimit to getArgValue(argv, "limit") as integer
            end if
            return getConversationList(conversationLimit)
        else
            return "Error: Unknown operation: " & operation
        end if
    on error errorMessage
        return "AppleScript Error: " & errorMessage
    end try
end run

-- Test if Messages app is accessible
on testAccess()
    try
        tell application "Messages"
            -- Simple test - just check if app is running
            set appName to name
            return "Success: Messages app accessible (" & appName & ")"
        end tell
    on error errorMessage
        return "Error: Cannot access Messages app. " & errorMessage
    end try
end testAccess

-- Send a text message
on sendTextMessage(recipient, messageText)
    try
        -- First ensure Messages app is running
        tell application "Messages"
            if not (exists window 1) then
                activate
                delay 1
            end if
        end tell

        tell application "Messages"
            -- Strategy: Force iMessage service explicitly on first attempt
            -- If this fails, Node.js layer will handle SMS fallback after checking delivery status

            try
                -- Force iMessage service explicitly
                set targetService to 1st service whose service type = iMessage
                set targetBuddy to buddy recipient of targetService
                send messageText to targetBuddy
                return "Success: Message sent to " & recipient & " via iMessage"
            on error iMessageError
                -- Return error - let Node.js handle SMS fallback after checking chat.db
                error "iMessage send failed: " & iMessageError
            end try
        end tell
    on error errorMessage
        return "Error: Failed to send message. " & errorMessage
    end try
end sendTextMessage

-- Send SMS message (used for fallback after iMessage delivery failure)
on sendSMSMessage(recipient, messageText)
    try
        tell application "Messages"
            -- Send directly to buddy - Messages will use SMS since iMessage failed
            -- This is simpler and more reliable than creating a new chat
            try
                send messageText to buddy recipient
                return "Success: Message sent to " & recipient & " via SMS fallback"
            on error smsError
                error "SMS fallback failed: " & smsError
            end try
        end tell
    on error errorMessage
        return "Error: Failed to send SMS message. " & errorMessage
    end try
end sendSMSMessage

-- Send a message with media attachment
on sendMediaMessage(recipient, messageText, filePath)
    try
        tell application "Messages"
            set mediaFile to POSIX file filePath as alias

            -- Strategy: Force iMessage service explicitly on first attempt
            -- If this fails, Node.js layer will handle MMS fallback after checking delivery status

            try
                -- Force iMessage service explicitly
                set targetService to 1st service whose service type = iMessage
                set targetBuddy to buddy recipient of targetService
                send mediaFile to targetBuddy
                if messageText is not "" then
                    send messageText to targetBuddy
                end if
                return "Success: Media message sent to " & recipient & " via iMessage"
            on error iMessageError
                -- Return error - let Node.js handle MMS fallback after checking chat.db
                error "iMessage media send failed: " & iMessageError
            end try
        end tell
    on error errorMessage
        return "Error: Failed to send media message. " & errorMessage
    end try
end sendMediaMessage

-- Send MMS message (used for fallback after iMessage delivery failure)
on sendSMSMediaMessage(recipient, messageText, filePath)
    try
        tell application "Messages"
            set mediaFile to POSIX file filePath as alias

            -- Send directly to buddy - Messages will use MMS/SMS since iMessage failed
            -- This is simpler and more reliable than creating a new chat
            try
                send mediaFile to buddy recipient
                if messageText is not "" then
                    send messageText to buddy recipient
                end if
                return "Success: Media message sent to " & recipient & " via MMS fallback"
            on error mmsError
                error "MMS fallback failed: " & mmsError
            end try
        end tell
    on error errorMessage
        return "Error: Failed to send MMS message. " & errorMessage
    end try
end sendSMSMediaMessage

-- Get list of conversations
on getConversationList(conversationLimit)
    try
        tell application "Messages"
            set conversationList to {}
            set textChats to text chats

            repeat with i from 1 to (count of textChats)
                if i > conversationLimit then exit repeat

                set currentChat to item i of textChats
                set chatName to name of currentChat
                set chatId to id of currentChat

                set conversationInfo to "ID:" & chatId & "|Name:" & chatName
                set end of conversationList to conversationInfo
            end repeat

            set AppleScript's text item delimiters to "||"
            set result to conversationList as string
            set AppleScript's text item delimiters to ""

            return "Success: " & result
        end tell
    on error errorMessage
        return "Error: Failed to get conversations. " & errorMessage
    end try
end getConversationList

-- Helper function to extract argument values
on getArgValue(argv, argName)
    repeat with arg in argv
        if arg starts with (argName & "=") then
            return text ((length of argName) + 2) thru -1 of arg
        end if
    end repeat
    return ""
end getArgValue