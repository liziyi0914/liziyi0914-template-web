//! 机器人角色。桌面上也编译，因为单测跑在宿主机上；
//! 真正的平台分支只在 command 注册与 `run_role` 上。

pub mod agent;
pub mod context;
pub mod device_flow;
pub mod tools;
