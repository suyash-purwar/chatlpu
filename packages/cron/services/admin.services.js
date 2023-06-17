import * as metaAPI from '@ayra/lib/apis/meta.api.js';
import sequelize, { Student, TGPA } from '@ayra/lib/db/index.js';
import templates from '@ayra/lib/botconfig/templates.js';
import generatePDFAndUploadToS3 from '@ayra/lib/utils/generate-pdf.js';
import { getObject } from '@ayra/lib/utils/aws.js';

export const firstHello = async (recipientNo) => {
  await metaAPI.sendTemplate(recipientNo, templates.initialHello.name);
};

// export const publishResult = async () => {
//   // Fetches the grades of every subject in every semester for every student
//   // As of now, targeting only two students
//   const [ subjectGrades ] = await sequelize.query(`
//     SELECT registration_no, semester, subject_code, grade, tgpa FROM (
//       SELECT
//       registration_no,
//       semester,
//       tgpa,
//       unnest(marks) ->> 'subjectId' AS subject_id,
//       unnest(marks) ->> 'grade' AS grade
//       FROM result
//     ) AS new_result
//     LEFT JOIN subject ON subject.id = CAST (new_result.subject_id AS INTEGER)
//     WHERE registration_no IN (12100435, 11937798)
//     ORDER BY registration_no, semester;
//   `);

//   // Organizes the subjectGrades 1d array into 3d array
//   const allSemesterResult = convertToStudentAndSemesterWiseGrades(subjectGrades);
  
//   await generatePDFAndUploadToS3(allSemesterResult);
// };

const formatResultPDFData = (studentDetails, grades, tgpa) => {
  const pdfData = {
    ...studentDetails,
    result: []
  };
  for (let semesterTgpa of tgpa) {
    pdfData.result.push({
      semester: semesterTgpa.semester,
      tgpa: semesterTgpa.tgpa,
      grades: []
    });
  }
  for (let grade of grades) {
    pdfData.result[grade.semester - 1].grades.push(grade);
  }
  return pdfData;
};

const createResultPDF = async (studentData) => {
  const lpuLogo = (await fs.readFile("/media/suyash/HDD/realwork/lpu-bot-prototype/packages/lib/media/raw/full-logo-no-bg.png")).toString("base64");
  const pdfData = {
    student: studentData,
    pdfAssets: {
      lpuLogo
    }
  };
  const resultTemplatePath = "/media/suyash/HDD/realwork/lpu-bot-prototype/packages/lib/static/template/result.ejs";

  const browser = await puppeteer.launch();
  const pageForAllSemesterPDF = await browser.newPage();
  const pageForLastSemesterPDF = await browser.newPage();

  let lastSemesterPDFFileName = `Last Semester Result ${studentData.registration_no}.pdf`;
  let allSemesterPDFFileName = `All Semester Result ${student.registration_no}.pdf`;
};

export const publishResult = async () => {
  const lpuLogo = (await fs.readFile("/media/suyash/HDD/realwork/lpu-bot-prototype/packages/lib/media/raw/full-logo-no-bg.png")).toString("base64");
  const pdfData = {
    pdfAssets: {
      lpuLogo
    }
  };
  const resultTemplatePath = "/media/suyash/HDD/realwork/lpu-bot-prototype/packages/lib/static/template/result.ejs";

  const browser = await puppeteer.launch();
  const pageForAllSemesterPDF = await browser.newPage();
  const pageForLastSemesterPDF = await browser.newPage();

  // Fetch 10 students at once and based on the id fetch result and tgpa one by one
  // As of now, we have only 3 active users
  let studentOffset = 0; let students;
  do {
    students = await sequelize.query(`
      SELECT 
        s.id,
        registration_no,
        first_name,
        middle_name,
        last_name,
        session,
        c.course_code,
        semester,
        father_name,
        mother_name
      FROM student s
      JOIN course c ON s.course_id = c.id
      WHERE registration_no IN (12100435, 11937798, 12276829)
      ORDER BY s.id
      LIMIT 10 OFFSET ${studentOffset};
    `);
    studentOffset += 10;
  } while (students[0].length == 10);

  for (let student of students[0]) {
    // Get student's profile picture from S3
    // const studentProfilePic = await getObject('profile-image', `${student.registration_no}.png`);
    // Get semester and subject wise grades
    const result = await sequelize.query(`
      SELECT 
        cs.semester,
        subject_code,
        grade
      FROM result r
      JOIN student s ON s.id = r.student_id
      JOIN course_subject cs ON cs.id = r.course_subject_id
      JOIN subject sub ON sub.id = cs.subject_id
      WHERE s.id=${student.id}
      ORDER BY semester;
    `);
    // Get semester wise tgpa
    const tgpa = await TGPA.findAll({
      where: { studentId: student.id },
      attributes: ['semester', 'tgpa']
    });
    delete student['id'];
    let studentData = formatResultPDFData(student, result[0], tgpa);
    // studentData.profilePicture = studentProfilePic;
    pdfData.student = studentData;

    let lastSemesterPDFFileName = `Last Semester Result ${studentData.registration_no}.pdf`;
    let allSemesterPDFFileName = `All Semester Result ${student.registration_no}.pdf`;
    console.log("----------------------");
  }
}

const convertToStudentAndSemesterWiseGrades = (subjectGrades) => {
  /**
   * Organized the 1d array of subject grades into 3d array
   * 
   * result = [
   *  student1[ 
   *    semester1[ 
   *      subject1{},
   *      subject2{},
   *      ...
   *    ],
   *    semester2[
   *      subject1{},
   *      subject2{},
   *      ...
   *    ],
   *    ...
   *  ],
   *  student2[
   *    semester1[ 
   *      subject1{},
   *      subject2{},
   *      ...
   *    ],
   *    semester2[
   *      subject1{},
   *      subject2{},
   *      ...
   *    ],
   *    ...
   *  ]
   * ]
   */

  let initialRegistrationNo = subjectGrades[0].registration_no;
  let initialSem = subjectGrades[0].semester;
  let allSemesterResult = [];
  let tempSubjectArray = [];
  let tempSemesterArray = [];
  
  for (let subject of subjectGrades) {
    if (initialRegistrationNo !== subject.registration_no) {
      initialSem = subject.semester;
      tempSemesterArray.push(tempSubjectArray)
      tempSubjectArray = [];
      allSemesterResult.push(tempSemesterArray);
      tempSemesterArray = [];
      initialRegistrationNo = subject.registration_no;
    }
    if (initialSem !== subject.semester) {
      initialSem = subject.semester;
      tempSemesterArray.push(tempSubjectArray);
      tempSubjectArray = [];
    }
    tempSubjectArray.push(subject);
  }
  tempSemesterArray.push(tempSubjectArray);
  allSemesterResult.push(tempSemesterArray);

  return allSemesterResult;
};

export const postUMC = async (id, reason, conclusion) => {
  const student = await Student.findOne({
    where: {
      registrationNo: +id
    }
  });
  const text = `
Respected ${student.dataValues.fatherName},

It is being brought to your attention that an indisciple case has been filed against your child, ${student.firstName} ${student.lastName} for not adhereing to university's guidelines.

Reason for Indiscipline Case: ${reason}

Punishment/Fine: ${conclusion}

For any queries, contact Security Office.
Contact: +91 9747273623
  `
  const message = {
    body: text
  };
  await metaAPI.sendMessage(student.fatherContact, message, "text");
  await metaAPI.sendTextMessage(student.fatherContact, msg);
};