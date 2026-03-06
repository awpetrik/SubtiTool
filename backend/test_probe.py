import ffmpeg
import sys
try:
    probe = ffmpeg.probe(sys.argv[1])
    print("duration:", probe['format']['duration'])
except Exception as e:
    print("error:", str(e))
