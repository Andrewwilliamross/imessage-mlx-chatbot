-- UI Automation approach for sending iMessages
-- This uses System Events to directly interact with the Messages UI

on run argv
    if (count of argv) < 1 then
        return "Error: No operation specified"
    end if

    set operation to item 1 of argv

    if operation starts with "operation=" then
        set operation to text 11 thru -1 of operation
    end if

    try
        if operation is "send_text" then
            if (count of argv) < 3 then
                return "Error: send_text requires recipient and message"
            end if
            set recipient to getArgValue(argv, "recipient")
            set messageText to getArgValue(argv, "message")
            return sendTextMessageUI(recipient, messageText)
        else
            return "Error: Unknown operation: " & operation
        end if
    on error errorMessage
        return "AppleScript Error: " & errorMessage
    end try
end run

-- Send message using UI automation
on sendTextMessageUI(recipient, messageText)
    try
        -- Ensure Messages is running and in focus
        tell application "Messages"
            activate
            delay 1
        end tell

        tell application "System Events"
            tell process "Messages"
                -- Wait for Messages to be ready
                repeat until exists window 1
                    delay 0.5
                end repeat

                -- Try to find existing conversation or create new one
                try
                    -- Click on New Message button
                    click button 1 of group 1 of splitter group 1 of window 1
                    delay 1

                    -- Type recipient in To field
                    set focused of text field 1 of group 1 of splitter group 1 of window 1 to true
                    keystroke recipient
                    delay 0.5
                    key code 36 -- Return key
                    delay 1

                    -- Type message in text field
                    set focused of text area 1 of scroll area 1 of splitter group 1 of window 1 to true
                    keystroke messageText
                    delay 0.5

                    -- Send message
                    key code 36 -- Return key

                    return "Success: Message sent via UI to " & recipient

                on error uiError
                    return "Error: UI automation failed - " & uiError
                end try
            end tell
        end tell

    on error errorMessage
        return "Error: Failed to send message via UI. " & errorMessage
    end try
end sendTextMessageUI

-- Helper function to extract argument values
on getArgValue(argv, argName)
    repeat with arg in argv
        if arg starts with (argName & "=") then
            return text ((length of argName) + 2) thru -1 of arg
        end if
    end repeat
    return ""
end getArgValue