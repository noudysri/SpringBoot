package com.smockin.admin.persistence.dao;

import com.smockin.admin.persistence.entity.S3MockDir;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface S3MockDirDAO extends JpaRepository<S3MockDir, Long> {

    @Query("FROM S3MockDir d WHERE d.extId = :extId")
    S3MockDir findByExtId(@Param("extId") final String extId);

    @Query("FROM S3MockDir d WHERE d.name = :name")
    List<S3MockDir> findAllByName(@Param("name") final String name);

}
