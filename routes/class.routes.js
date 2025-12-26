/**
 * Class Routes
 * 
 * CRUD operations for classes
 */

const express = require('express');
const router = express.Router();
const Class = require('../models/Class');
const { authenticateTeacher, authenticateUser } = require('../middleware/auth');

// Get all classes (for teacher, returns their classes)
router.get('/', authenticateUser, async (req, res) => {
  try {
    let query = {};
    
    // If teacher, only show their classes
    if (req.userRole === 'teacher') {
      query.teacherId = req.userId;
    }
    
    const classes = await Class.find(query).sort({ name: 1 });
    res.json(classes);
  } catch (error) {
    console.error('Get classes error:', error);
    res.status(500).json({ error: 'Failed to get classes' });
  }
});

// Get single class
router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const cls = await Class.findOne({ 
      $or: [
        { _id: req.params.id },
        { classId: req.params.id }
      ]
    });
    
    if (!cls) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    res.json(cls);
  } catch (error) {
    console.error('Get class error:', error);
    res.status(500).json({ error: 'Failed to get class' });
  }
});

// Create class
router.post('/', authenticateTeacher, async (req, res) => {
  try {
    const { classId, name, subject, room, beaconConfig, schedule } = req.body;
    
    if (!classId || !name) {
      return res.status(400).json({ error: 'classId and name are required' });
    }
    
    // Check if classId already exists
    const existing = await Class.findOne({ classId });
    if (existing) {
      return res.status(409).json({ error: 'Class ID already exists' });
    }
    
    const newClass = new Class({
      classId,
      name,
      subject,
      room,
      teacherId: req.userId,
      beaconConfig,
      schedule,
      isActive: true
    });
    
    await newClass.save();
    
    res.status(201).json({
      message: 'Class created successfully',
      class: newClass
    });
  } catch (error) {
    console.error('Create class error:', error);
    res.status(500).json({ error: 'Failed to create class' });
  }
});

// Update class
router.put('/:id', authenticateTeacher, async (req, res) => {
  try {
    const { name, subject, room, beaconConfig, schedule, isActive } = req.body;
    
    const cls = await Class.findOneAndUpdate(
      { 
        $or: [
          { _id: req.params.id },
          { classId: req.params.id }
        ],
        teacherId: req.userId // Only allow updating own classes
      },
      { name, subject, room, beaconConfig, schedule, isActive },
      { new: true }
    );
    
    if (!cls) {
      return res.status(404).json({ error: 'Class not found or not authorized' });
    }
    
    res.json({ message: 'Class updated', class: cls });
  } catch (error) {
    console.error('Update class error:', error);
    res.status(500).json({ error: 'Failed to update class' });
  }
});

// Delete class
router.delete('/:id', authenticateTeacher, async (req, res) => {
  try {
    const cls = await Class.findOneAndDelete({
      $or: [
        { _id: req.params.id },
        { classId: req.params.id }
      ],
      teacherId: req.userId
    });
    
    if (!cls) {
      return res.status(404).json({ error: 'Class not found or not authorized' });
    }
    
    res.json({ message: 'Class deleted successfully' });
  } catch (error) {
    console.error('Delete class error:', error);
    res.status(500).json({ error: 'Failed to delete class' });
  }
});

// Add students to class
router.post('/:id/students', authenticateTeacher, async (req, res) => {
  try {
    const { studentIds } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds)) {
      return res.status(400).json({ error: 'studentIds array is required' });
    }
    
    const cls = await Class.findOneAndUpdate(
      { 
        $or: [
          { _id: req.params.id },
          { classId: req.params.id }
        ]
      },
      { $addToSet: { students: { $each: studentIds } } },
      { new: true }
    );
    
    if (!cls) {
      return res.status(404).json({ error: 'Class not found' });
    }
    
    res.json({ message: 'Students added', class: cls });
  } catch (error) {
    console.error('Add students error:', error);
    res.status(500).json({ error: 'Failed to add students' });
  }
});

module.exports = router;
