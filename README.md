Ausculta
A CNN-assisted auscultation instrument for lung-sound monitoring, longitudinal tracking, and rehabilitation support.
Ausculta is a senior high school research project pairing an ESP32-based smart stethoscope with a convolutional neural network that classifies respiratory sounds into four patterns — normal, wheeze, crackle, and combined wheeze-and-crackle — inside a mobile-first platform for guided auscultation, recording-quality control, longitudinal comparison, and practitioner review.
Live application: https://ausculta.base44.app
Research prototype — not a medical device. Ausculta is not cleared or approved by any regulatory body and does not diagnose asthma, pneumonia, or any other condition. All AI output is decision-support information intended for interpretation by a licensed medical practitioner. Do not use it for clinical decision-making.

System overview
chest piece → MEMS mic + preamp → ESP32 → BLE / MicroSD → mobile app
                                                              ↓
   noise reduction → filtering → segmentation → mel-spectrogram → CNN
                                                              ↓
                  quality check → classification → practitioner review
Recordings are taken at six standardized lung locations using an anatomical lung map in the app. Each recording is scored for quality before analysis, and poor recordings can be retaken rather than forced through the classifier. Results are stored with metadata (location, duration, device source, quality status) so a current recording can be compared against earlier recordings from the same site.
Hardware
Component	Part
Microcontroller	ESP32 (BLE)
Microphone	INMP441 omnidirectional MEMS
Amplification	Microphone preamplifier module
Storage	MicroSD card reader module
Display	20×4 LCD with I²C adapter
Power	Rechargeable Li-ion with charging/protection circuitry
Acoustic front end	Acoustic stethoscope chest piece, silicone tubing
Enclosure	3D-printed PLA, 19 × 15.2 × 8.6 cm

Wiring diagram: docs/hardware-wiring-diagram-fritzing.jpg
Model
The classifier was developed with the ICBHI 2017 Respiratory Sound Database (920 recordings, 126 patients, 6,898 annotated respiratory cycles) as the reference dataset. Input is a mel-spectrogram; the network applies convolutional and pooling layers, then fully connected layers and a softmax over the four sound classes.
The deployed artifact in this repository is a WebAssembly export from Edge Impulse Studio (SIMD build, deploy version 5). The ICBHI dataset itself is not redistributed here — obtain it from the source under its own terms.
Application
Built on Base44, with role-based access for patients, medical practitioners/staff, and admins. A human-in-the-loop review layer lets a practitioner confirm, disagree with, modify, or request a repeat of any AI classification, and a de-identified research dashboard exposes reference labels, predictions, practitioner confirmations, and model-performance statistics.

Repository layout
Path	Contents
research-paper/	The main Ausculta platform paper
model/smartstethoscope-wasm-browser-simd-v5-impulse-#1/browser/	Edge Impulse WASM deployment and browser inference demo — the only runnable code
docs/	Hardware wiring diagram and supporting documentation
competition/rstf/	Complete SEI-T-RSTF7 submission set (as-submitted PDFs)
competition/final-submission/	ISEF 2026 / PPSci 2025 / TUKLAS documents and approval forms
competition/drafts/	Working drafts — distinct versions, not copies of rstf/
fieldwork/	Interview recordings and clinic documentation backing the research

Files under competition/ are records of what was submitted and should not be modified in place.
Running the model demo
cd "model/smartstethoscope-wasm-browser-simd-v5-impulse-#1/browser"
python server.py
Open http://localhost:8082, paste a comma-separated list of raw feature values (an audio window matching the impulse's input frame), and click Run inference. The port is hardcoded in server.py. The page must be served over HTTP — opening index.html via file:// fails because the browser cannot fetch the .wasm module.
edge-impulse-standalone.js and edge-impulse-standalone.wasm are generated code and should not be hand-edited; to update the model, re-export the WASM deployment from Edge Impulse Studio and replace both files. run-impulse.js is the hand-written EdgeImpulseClassifier wrapper (init, classify, classifyContinuous, getProjectInfo, getProperties, setThreshold) and is the integration point for embedding the classifier in another application.

Preliminary findings
Testing covered recording quality, response time, signal strength, noise resilience, agreement with reference classifications, and end-user acceptance across 30 respondents plus three hospital patients. Selected results:
    • Recording quality — 68% of recordings rated Good, 25% Acceptable, 7% Poor.
    • Signal strength — mean 32.49 dB for Ausculta versus 7.89 dB for a conventional stethoscope under the tested conditions. Higher measured amplitude does not by itself establish better clinical performance.
    • Classification agreement — 6 of 15 paired reference/device classifications matched (40%). McNemar's exact test returned p = 1.000, but with n = 15 the test is severely underpowered and a non-significant result should not be read as evidence of equivalence.
These are feasibility results from a prototype. The study does not establish classification accuracy, reliability, or clinical validity, and further validation in actual healthcare settings is required before any conclusions about performance are drawn.
Clinical validation involved review by three pulmonologists (one also a practicing pediatrician) and supervised device testing with three patients at a private hospital.

Alignment
SDG 3 (Good Health and Well-Being), SDG 4 (Quality Education), SDG 9 (Industry, Innovation and Infrastructure).
Author
Ahnycca Krish N. Malimban Science, Technology, Engineering, and Mathematics — Senior High School Department Puerto Princesa City National Science High School, Palawan, Philippines
Citation
@misc{malimban2026ausculta,
  author = {Malimban, Ahnycca Krish N.},
  title  = {Ausculta: A CNN-Assisted Auscultation Instrument for Lung Sound
            Monitoring, Longitudinal Tracking, and Rehabilitation Support-System},
  year   = {2026},
  school = {Puerto Princesa City National Science High School},
  url    = {https://github.com/HaredRay1/Ausculta}
}
License
Not yet specified. Until a license file is added, all rights are reserved and the contents of this repository may not be reused. Third-party components (the ICBHI 2017 dataset, Edge Impulse generated code) remain under their own terms.

