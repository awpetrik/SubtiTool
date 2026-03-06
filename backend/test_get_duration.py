import ffmpeg
import sys

filepath = sys.argv[1]
try:
    probe = ffmpeg.probe(filepath)
    print("duration:", probe['format']['duration'])
except Exception as e:
    print("error:", str(e))
