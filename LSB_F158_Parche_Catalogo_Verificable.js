/* LSB F158 — puente de catálogo académico y Excel.
   Añadir después de todos los scripts de index.html, antes de </body>.
   El servidor ya cuenta con lsb_save_course_secure y lsb_create_academic_group_secure.
   Esta versión no sustituye los controles de RLS ni guarda datos de demostración. */
(function () {
  "use strict";
  if (typeof LSB18 === "undefined" || typeof lsb18Client !== "function") return;
  const s = v => String(v ?? "").trim();
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const admin = () => LSB18.authenticated === true &&
    LSB18.profile?.role === "admin_general" && LSB18.profile?.active === true;
  const requireAdmin = () => {
    if (!admin() || typeof isArchived === "function" && isArchived()) {
      toast("Solo Dirección general puede modificar el ciclo activo.");
      return false;
    }
    return true;
  };
  async function reloadVerified(table, id) {
    // La recarga también descarta alteraciones transitorias de la interfaz.
    await lsb18Load();
    const records = LSB18.rows?.[table];
    if (!Array.isArray(records) || !records.some(x => x.id === id)) {
      throw Error("Supabase confirmó la operación, pero el registro aún no aparece en la consulta. Comprueba antes de reintentar.");
    }
    document.getElementById("dialog")?.close();
    render();
  }
  function saveError(error) {
    toast("No se confirmó el guardado: " + s(error?.message || error) +
      ". Comprueba el registro antes de repetir.");
  }
  courseForm6 = function (cid = "") {
    if (!requireAdmin()) return;
    const c = db.courses.find(x => x.id === cid);
    form(c ? "Editar curso en Supabase" : "Crear curso en Supabase",
      `<p class="sub">El registro se guarda en Supabase. No se muestra éxito sin confirmación del servidor.</p>
       <label class="field">Nombre del curso
       <input name="name" maxlength="90" required value="${esc(c?.name || "")}"></label>`,
      async data => {
        if (!requireAdmin()) return;
        const name = s(data.get("name"));
        if (name.length < 2) throw Error("Escribe un nombre de al menos dos caracteres.");
        let confirmed = false;
        try {
          const {data: id, error} = await lsb18Client().rpc("lsb_save_course_secure",
            {p_course_id: c?.id || null, p_name: name});
          if (error) throw Error(error.message);
          if (!id) throw Error("No se devolvió identificador del curso.");
          confirmed = true;
          await reloadVerified("lsb_courses", id);
          toast("Curso registrado y verificado en Supabase.");
        } catch (e) {
          saveError(confirmed ? Error("El curso pudo guardarse pero no se pudo refrescar la pantalla.") : e);
        }
      }, c ? "Actualizar curso" : "Guardar curso"
    );
  };

  groupForm6 = async function (gid = "") {
    if (!requireAdmin()) return;
    if (gid) {
      toast("La edición del grado existente debe realizarse desde su ficha segura. No se guardó ningún cambio.");
      return;
    }
    let offers;
    try {
      offers = await lsb18Fetch("lsb_academic_offerings");
      if (!Array.isArray(offers)) throw Error("No se cargaron las ofertas.");
    } catch (e) { return saveError(e); }
    const active = offers.filter(x => x.active === true);
    if (!active.length) return toast("No hay ofertas académicas activas.");
    const year = (LSB18.rows?.lsb_school_years || [])
      .find(x => Number(x.year) === Number(cycleYear()));
    if (!year) return toast("El ciclo seleccionado no existe en Supabase.");
    form("Crear grado y sección — ciclo " + year.year,
      `<p class="sub">El grado, su oferta académica y la sección se crean en una sola transacción.
      Si falla un paso, ninguno se guardará.</p>
      <label class="field">Carrera u oferta académica
      <select name="offering" required>${active.map(x =>
        `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select></label>
      <label class="field">Nombre del grado
      <input name="grade" maxlength="90" placeholder="Cuarto Bachillerato" required></label>
      <label class="field">Sección
      <input name="section" maxlength="20" value="A" required></label>
      <label class="field">Capacidad
      <input name="capacity" type="number" min="1" max="1000" value="40" required></label>`,
      async data => {
        if (!requireAdmin()) return;
        const offering = s(data.get("offering"));
        const grade = s(data.get("grade"));
        const section = s(data.get("section")).toUpperCase();
        const capacity = Number(data.get("capacity"));
        if (!active.some(x => x.id === offering) || grade.length < 2 ||
            !/^[A-ZÁÉÍÓÚÜÑ0-9 -]{1,20}$/.test(section) ||
            !Number.isInteger(capacity) || capacity < 1 || capacity > 1000) {
          throw Error("Oferta, grado, sección o capacidad inválidos.");
        }
        let confirmed = false;
        try {
          const {data: result, error} = await lsb18Client().rpc(
            "lsb_create_academic_group_secure", {
              p_school_year_id: year.id,
              p_offering_id: offering,
              p_grade_name: grade,
              p_section_name: section,
              p_capacity: capacity
            });
          if (error) throw Error(error.message);
          if (!result?.section_id) throw Error("Supabase no devolvió identificador de sección.");
          confirmed = true;
          await reloadVerified("lsb_sections", result.section_id);
          toast("Grado, oferta y sección verificados en Supabase.");
        } catch (e) {
          saveError(confirmed ? Error("El grupo pudo guardarse pero la pantalla no se actualizó.") : e);
        }
      }, "Crear grado y sección");
  };

  assignmentForm6 = function () {
    if (!requireAdmin()) return;
    const courses = (LSB18.rows?.lsb_courses || []).filter(x => x.active !== false);
    const sections = (LSB18.rows?.lsb_sections || []).filter(x =>
      x.active !== false && x.school_year_id === LSB18.schoolYearId);
    const teachers = db.accounts.filter(x => x.type === "teacher" && x.enabled);
    if (!courses.length || !sections.length || !teachers.length) {
      toast("Necesitas un curso, una sección del ciclo y un profesor activo.");
      return;
    }
    form("Asignar curso a profesor — Supabase",
      `<label class="field">Curso
      <select name="course">${courses.map(c =>
        `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select></label>
       <label class="field">Sección
      <select name="section">${sections.map(sec => {
        const g = db.groups.find(x => x.id === sec.id);
        return `<option value="${esc(sec.id)}">${esc(g?.name || sec.name)}</option>`;
      }).join("")}</select></label>
      <label class="field">Profesor
      <select name="teacher">${teachers.map(t =>
        `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</select></label>`,
      async fd => {
        if (!requireAdmin()) return;
        const course = s(fd.get("course")), section = s(fd.get("section")),
          teacher = s(fd.get("teacher"));
        if (!courses.some(x => x.id === course) ||
            !sections.some(x => x.id === section) ||
            !teachers.some(x => x.id === teacher)) {
          throw Error("Curso, sección o profesor no disponible.");
        }
        const previous = (LSB18.rows?.lsb_teaching_assignments || [])
          .find(a => a.course_id === course && a.section_id === section);
        if (previous && previous.teacher_id !== teacher) {
          const accepted = await window.lsbPwaConfirm(
            "Esta materia ya tiene otro profesor. ¿Confirmar la reasignación? " +
            "Supabase bloqueará el cambio si existe historial de calificaciones."
          );
          if (!accepted) return;
        }
        let confirmed = false;
        try {
          const {data: id, error} = await lsb18Client().rpc("lsb_v191_assign_teacher", {
            p_course: course, p_section: section, p_teacher: teacher
          });
          if (error) throw Error(error.message);
          if (!id) throw Error("No se devolvió asignación.");
          confirmed = true;
          await reloadVerified("lsb_teaching_assignments", id);
          toast("Asignación docente confirmada en Supabase.");
        } catch (e) {
          saveError(confirmed ? Error("La asignación pudo guardarse pero la vista no se actualizó.") : e);
        }
      }, "Guardar asignación");
  };

  // Hoja de importación descargable aunque el ciclo aún no tenga secciones.
  const oldAction = action;
  action = function (name, arg) {
    if (name === "lsb19115-template" || name === "importtemplate7") {
      if (!admin()) return toast("Solo Dirección puede descargar esta plantilla.");
      const rows = [
        ["Código personal","Apellidos","Nombres","Carrera o nivel","Grado","Sección"],
        ...Array.from({length:100}, () => ["","","","","",""])
      ];
      Promise.resolve(buildWorkbook6([workbookSheet("Estudiantes",rows,[1],[],[23,30,30,37,29,17])]))
        .then(blob => {
          downloadBlob(blob,"LSB_Plantilla_100_Estudiantes_" + cycleYear() + ".xlsx");
          toast("Plantilla multigrado descargada. Completa los destinos desde Supabase.");
        }).catch(saveError);
      return;
    }
    if (name === "newstudent") {
      toast("Para registrar estudiantes, utiliza Importar estudiantes. No se guardó un registro local.");
      go("importstudents");
      return;
    }
    return oldAction(name,arg);
  };

  // Lector XLSX compatible con etiquetas XML con prefijo y sin prefijo.
  // Corrige los errores de hojas vacías y propiedades "rid" indefinidas.
  if (typeof readXlsx7 === "function" && typeof JSZip !== "undefined") {
    readXlsx7 = async function(file) {
      if (!file || !/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
        throw Error("Selecciona un archivo .xlsx de hasta 5 MB.");
      }
      const zip = await JSZip.loadAsync(file);
      const xml = async path => {
        const entry = zip.file(path);
        if (!entry) throw Error("Archivo Excel incompleto: " + path);
        const raw = await entry.async("string");
        if (raw.length > 15000000) throw Error("Hoja demasiado grande.");
        const doc = new DOMParser().parseFromString(raw,"application/xml");
        if (doc.getElementsByTagName("parsererror").length) {
          throw Error("El Excel contiene XML inválido.");
        }
        return doc;
      };
      const nodes = (root,tag) => Array.from(root.getElementsByTagNameNS("*",tag));
      const first = (root,tag) => nodes(root,tag)[0] || null;
      const text = (root,tag) => first(root,tag)?.textContent || "";
      const [workbook,relations] = await Promise.all([
        xml("xl/workbook.xml"),xml("xl/_rels/workbook.xml.rels")
      ]);
      const rs = nodes(relations,"Relationship");
      const sheets = nodes(workbook,"sheet").map(sh => ({
        name:sh.getAttribute("name") || "",
        rid:sh.getAttribute("r:id") ||
          sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id")
      }));
      if (!sheets.length || sheets.some(sh=>!sh.rid)) {
        throw Error("El archivo no contiene hojas de Excel compatibles.");
      }
      const stringDoc = zip.file("xl/sharedStrings.xml")
        ? await xml("xl/sharedStrings.xml") : null;
      const strings = stringDoc
        ? nodes(stringDoc,"si").map(si=>nodes(si,"t").map(t=>t.textContent).join(""))
        : [];
      return {
        sheets,
        async rows(rid) {
          const rel=rs.find(r=>r.getAttribute("Id")===rid);
          if (!rel || rel.getAttribute("TargetMode")==="External") {
            throw Error("Hoja no encontrada dentro del Excel.");
          }
          let path=rel.getAttribute("Target") || "";
          path=path.replace(/\\/g,"/");
          if (path.startsWith("/")) path=path.slice(1);
          else if (!path.startsWith("xl/")) path="xl/"+path.replace(/^\.\//,"");
          const segments=[];
          for(const part of path.split("/")) {
            if (!part || part===".") continue;
            if (part==="..") {
              if (!segments.length) throw Error("Ruta inválida en el Excel.");
              segments.pop();
            } else segments.push(part);
          }
          const doc=await xml(segments.join("/"));
          return nodes(doc,"row").map(row => {
            const cells=[];
            for(const c of nodes(row,"c")) {
              const letter=(c.getAttribute("r") || "").replace(/\d/g,"");
              if (!/^[A-Z]{1,3}$/.test(letter)) continue;
              const col=[...letter].reduce((v,ch)=>v*26+ch.charCodeAt(0)-64,0)-1;
              const type=c.getAttribute("t");
              const raw=text(c,"v");
              cells[col]=type==="s"
                ? (strings[Number(raw)] ?? "")
                : type==="inlineStr"
                ? (first(c,"is") ? nodes(first(c,"is"),"t").map(n=>n.textContent).join("") : "")
                : raw;
            }
            return cells;
          });
        }
      };
    };
  }

})();
