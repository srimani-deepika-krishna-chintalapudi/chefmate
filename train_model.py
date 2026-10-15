
import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, accuracy_score

# 1. Load dataset
df = pd.read_csv("../chefmate_voice_commands_830.csv")
# IMPORTANT: Change these to match your actual CSV columns
TEXT_COL = "command_text"
LABEL_COL = "intent"

# 2. Clean the data
df = df[[TEXT_COL, LABEL_COL]].dropna()
df[TEXT_COL] = df[TEXT_COL].astype(str).str.strip()
df[LABEL_COL] = df[LABEL_COL].astype(str).str.strip()
df = df[
    (df[TEXT_COL] != "") &
    (df[LABEL_COL] != "")
].drop_duplicates()

print("Dataset size:", len(df))
print("\nExamples per intent:")
print(df[LABEL_COL].value_counts())

# 3. Split into training and testing data
X_train, X_test, y_train, y_test = train_test_split(
    df[TEXT_COL],
    df[LABEL_COL],
    test_size=0.20,
    random_state=42,
    stratify=df[LABEL_COL]
)

# 4. Build the ML pipeline
model = Pipeline([
    ("tfidf", TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, 2),
        strip_accents="unicode"
    )),
    ("classifier", LogisticRegression(
        max_iter=1000,
        class_weight="balanced"
    ))
])

# 5. Train the model
model.fit(X_train, y_train)

# 6. Evaluate on unseen test examples
predictions = model.predict(X_test)

print("\nAccuracy:", round(
    accuracy_score(y_test, predictions) * 100, 2
), "%")

print("\nClassification report:")
print(classification_report(
    y_test, predictions, zero_division=0
))

from sklearn.svm import LinearSVC
from sklearn.metrics import accuracy_score, classification_report
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer

svm_model = Pipeline([
    ("tfidf", TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, 2),
        strip_accents="unicode",
        sublinear_tf=True
    )),
    ("classifier", LinearSVC(class_weight="balanced"))
])

svm_model.fit(X_train, y_train)
svm_predictions = svm_model.predict(X_test)

print("\nLinear SVM Accuracy:",
      round(accuracy_score(y_test, svm_predictions) * 100, 2), "%")

print("\nLinear SVM Classification Report:")
print(classification_report(
    y_test, svm_predictions, zero_division=0
))

# 7. Save the trained model
# 7. Save both trained models
joblib.dump(model, "chefmate_intent_model.joblib")
joblib.dump(svm_model, "chefmate_intent_svm.joblib")

print("\nLogistic Regression model saved!")
print("Linear SVM model saved!")