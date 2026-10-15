
import joblib

# Load the Linear SVM model
model = joblib.load("chefmate_intent_svm.joblib")

commands = [
    "Could you make the video silent?",
    "Carry on from where we stopped",
    "Get me out of full screen",
    "Go back fifteen seconds",
    "Can you slow the video down?",
    "Show me what I need for this recipe",
    "Please move to the step before this one",
    "Let the sound play again"
]

print("Testing Linear SVM\n")

for command in commands:
    prediction = model.predict([command])[0]
    print(f"Command: {command}")
    print(f"Predicted intent: {prediction}\n")
