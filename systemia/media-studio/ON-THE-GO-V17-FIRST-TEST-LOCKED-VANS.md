# On The Go V17: locked van-reveal still / first test candidate

Owner feedback: V16 is otherwise near done, but the still photograph of Juan's fleet wobbles during the first van reveal. Freeze only that scene and preserve the voice, music, pacing, repair clips, stationary Juan portrait and end card.

## Changes and verification
- Input: V16 continuous Bella edit, already owner-liked.
- Frames 192 through 263 (8.00s to 10.958s, 72 frames) replaced with one **actual original composite frame** sourced at ~8.333s from that shot, preserving the existing ON THE GO text and full portrait image.
- Visuals outside the 8–11s reveal unchanged except H.264 re-encode noise (<0.75 mean absolute channel units on several samples).
- Locked hero frames decoded with max mean channel difference under 0.003: no discernible movement or drifting.
- AAC audio packet SHA256 matches V16 exactly: 2245ae8e74ff8f85764391af1f357e1923cef3f1303f6c589ff029077cf04765
- 30.000 seconds, 720x1280, 24 fps, H.264 video/AAC audio, full-frame/video+audio decode pass.
- Output SHA256: a72629f55021123d32dd298c79f446689f180c8794d070f75c53165472a70162
- Internal technical QA pass, human listening/playback check and Juan approval still required.
- Private (not shared) Drive artifact: https://drive.google.com/file/d/1syx9vZzmqOYtwiovS2HA19HxuNFt-MvY/view?usp=drivesdk
- QA screenshot: https://drive.google.com/file/d/1R-Uuy-Pag6jPAvdl-7MYRQ6-AQOrTyJ8/view?usp=drivesdk

## Distribution gates
This is the FIRST CLIENT-TEST CANDIDATE, not a published advertisement. No message to Juan sent automatically, and Google Drive remains owner-private. Deliver the MP4 itself in Messenger, or intentionally grant Juan viewing access after owner confirmation. Before publication: client sign-off for identity, contact details and service claims; review stock-actor rights and Mixkit track license scope.