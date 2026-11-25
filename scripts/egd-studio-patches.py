"""Ajustes de OpenNite sobre el código de EGD extraído en src/core/egd-studio.mjs.

Se aplican después de generar el módulo con las herramientas de egd-tools
(extract -> closure -> emit). Cada parche falla si no encuentra su texto, así se
nota cuando una versión nueva de EGD cambia el código.

Uso: python3 scripts/egd-studio-patches.py src/core/egd-studio.mjs
"""
import sys

PATCHES = [
    # Animaciones de OpenNite: pasos laterales, giros y correr hacia atrás.
    ('var Ca = {idle:"Reposo",walk:"Andar",run:"Correr",',
     'var Ca = {idle:"Reposo",walk:"Andar",run:"Correr",runBack:"Correr hacia atr\\xE1s",strafeLeft:"Paso lateral izquierda",strafeRight:"Paso lateral derecha",turnLeft:"Girar a la izquierda",turnRight:"Girar a la derecha",'),
    # Reconocer esas animaciones por el nombre del clip (Mixamo: "Running Backward", "Left Strafe", "Running Left Turn"...).
    ('["idle",/idle|breath|stand|reposo/i],["run",',
     '["idle",/idle|breath|stand|reposo/i],'
     '["runBack",/(run|jog|sprint|correr).*(back|atr)|back.*(run|jog)/i],'
     '["strafeLeft",/strafe.*left|left.*strafe|lateral.*izq/i],["strafeRight",/strafe.*right|right.*strafe|lateral.*der/i],'
     '["turnLeft",/turn.*left|left.*turn|gir.*izq/i],["turnRight",/turn.*right|right.*turn|gir.*der/i],["run",'),
    ('var dA = new Set(["idle","walk","run","sit"]);',
     'var dA = new Set(["idle","walk","run","sit","runBack","strafeLeft","strafeRight","turnLeft","turnRight"]);'),
    # Fallo de EGD: la lista de vehículos llama a Zi({label, icon...}) y salía "[object Object]".
    ('function Zi(a,{active:e=!1,onClick:t,onDblClick:i,icon:n="",extra:s=null}={}){',
     'function Zi(a,{active:e=!1,onClick:t,onDblClick:i,icon:n="",extra:s=null}={}){if(a&&typeof a=="object"&&!a.nodeType&&"label"in a)return Zi(a.label,a);'),
]

p = sys.argv[1]
s = open(p, encoding='utf-8').read()
for old, new in PATCHES:
    if new in s:
        continue
    assert s.count(old) == 1, 'No se encuentra (o se repite): ' + old[:60]
    s = s.replace(old, new)
open(p, 'w', encoding='utf-8').write(s)
print('Parches aplicados:', len(PATCHES))
