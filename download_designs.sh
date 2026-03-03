#!/bin/bash
PROJECT_ID="11371057986291001011"
mkdir -p designs

# format: name:id
screens=(
    "confirmacao_tarefa:1c4aec14f9e94263bd5f56b287b8d5f5"
    "gestao_checklists:456eba69ff5f4dec95c2ba81f4b0ca6a"
    "dashboard_principal:531ff74fbc0943359a47c872c87dc2af"
    "checklist_dia:53febb7b4699421dba12c95c275373dd"
    "landing_page:58209f7022594c1981b8e2b456f2c7f0"
    "gestao_colaboradores:65a1685e90224b10b69e4051fb9d91f3"
    "home_turno:7e2649832d1a45ec87419010d279fed8"
    "historico_tarefas:88e30cf1359b42689fbc450e4852d762"
    "relatorios:bb016bcd2c6449ccacf2780d478446ae"
    "tela_tarefa_foto:cfc66f333a9446fd8092924562d046e1"
    "login_mobile:e2cfe93d45f74187b6d2e2c8eac52cbd"
)

for screen in "${screens[@]}"; do
    name=$(echo "$screen" | cut -d: -f1)
    id=$(echo "$screen" | cut -d: -f2)
    echo "Downloading $name ($id)..."
    curl -L -o "designs/${name}.png" "https://stitch.withgoogle.com/render/p/${PROJECT_ID}/s/${id}/image"
    curl -L -o "designs/${name}.html" "https://stitch.withgoogle.com/render/p/${PROJECT_ID}/s/${id}/code"
done
